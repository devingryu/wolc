use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::fs::{self, File};
use std::io::{BufReader, BufWriter, ErrorKind}; // ErrorKind 추가
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};
use uuid::Uuid; 

// 프론트엔드의 Device 인터페이스와 일치하는 Rust 구조체 정의
// Serialize, Deserialize를 derive하여 JSON 변환 가능하도록 함
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Device {
    // ID는 백엔드에서 UUID로 생성 후 문자열로 관리
    id: String,
    name: String,
    mac: String,
    // 프론트엔드(JS/TS)의 camelCase 필드명(targetAddr)과 매칭하고,
    // None일 경우 JSON 직렬화에서 제외
    #[serde(rename = "targetAddr", skip_serializing_if = "Option::is_none")]
    target_addr: Option<String>,
}

// --- Helper Functions ---

// 설정 디렉토리 내의 devices.json 파일 경로를 가져오는 함수
// 설정 디렉토리가 없으면 생성함
fn get_config_path(app_handle: &AppHandle) -> Result<PathBuf> {
    // app_handle.path().app_config_dir()를 사용하여 앱별 설정 디렉토리 경로 획득
    let config_dir = app_handle
        .path()
        .app_config_dir()
        .context("애플리케이션 설정 디렉토리를 가져올 수 없습니다.")?; // 오류 컨텍스트 추가

    // 설정 디렉토리가 존재하지 않으면 생성
    if !config_dir.exists() {
        fs::create_dir_all(&config_dir)
            .with_context(|| format!("설정 디렉토리 생성 실패: {:?}", config_dir))?;
        println!("Config directory created at: {:?}", config_dir); // 생성 로그
    }

    // 설정 디렉토리 내의 devices.json 파일 경로 반환
    Ok(config_dir.join("devices.json"))
}

// JSON 파일에서 장치 목록을 읽어오는 함수
fn read_devices_from_file(path: &Path) -> Result<Vec<Device>> {
    match File::open(path) {
        Ok(file) => {
            // 파일이 존재하면 읽어서 역직렬화
            let reader = BufReader::new(file);
            let devices: Vec<Device> = serde_json::from_reader(reader)
                .with_context(|| format!("장치 파일 역직렬화 실패: {:?}", path))?;
            Ok(devices)
        }
        Err(error) if error.kind() == ErrorKind::NotFound => {
            // 파일이 존재하지 않으면 빈 목록 반환 (오류 아님)
            println!("Device file not found at {:?}, returning empty list.", path);
            Ok(Vec::new())
        }
        Err(error) => {
            // 그 외 파일 열기 오류
            Err(error).with_context(|| format!("장치 파일 열기 실패: {:?}", path))
        }
    }
}

// 장치 목록을 JSON 파일에 쓰는 함수 (덮어쓰기)
fn write_devices_to_file(path: &Path, devices: &[Device]) -> Result<()> {
    // 파일을 생성하거나 열어서 쓰기 준비 (기존 내용 삭제)
    let file = File::create(path)
        .with_context(|| format!("장치 파일 생성/열기 실패: {:?}", path))?;
    let writer = BufWriter::new(file);
    // JSON 형식으로 직렬화하여 파일에 쓰기 (pretty print로 가독성 높임)
    serde_json::to_writer_pretty(writer, devices)
        .with_context(|| format!("장치 파일 직렬화 실패: {:?}", path))?;
    Ok(())
}

// --- Internal Logic Functions (using anyhow::Result) ---
// 내부 로직 함수들은 anyhow::Result를 반환하여 에러 처리를 용이하게 함

async fn load_devices_internal(app_handle: AppHandle) -> Result<Vec<Device>> {
    let path = get_config_path(&app_handle)?;
    println!("Reading devices from: {:?}", path);
    read_devices_from_file(&path)
}

async fn add_device_internal(app_handle: AppHandle, mut new_device_data: Device) -> Result<Vec<Device>> {
    let path = get_config_path(&app_handle)?;
    let mut devices = read_devices_from_file(&path)?;

    // 새 장치의 ID 생성 (기존 ID가 있더라도 덮어씀)
    new_device_data.id = Uuid::new_v4().to_string();
    println!("Generated new device ID: {}", new_device_data.id);

    // TODO: 필요시 중복 검사 (예: 동일 MAC 주소)
    // if devices.iter().any(|d| d.mac == new_device_data.mac) {
    //     anyhow::bail!("Device with MAC {} already exists", new_device_data.mac);
    // }

    devices.push(new_device_data); // 목록에 새 장치 추가
    write_devices_to_file(&path, &devices)?; // 변경된 목록을 파일에 저장
    println!("Device added. Total devices: {}", devices.len());
    Ok(devices) // 업데이트된 전체 장치 목록 반환
}

async fn update_device_internal(app_handle: AppHandle, updated_device: Device) -> Result<Vec<Device>> {
    let path = get_config_path(&app_handle)?;
    let mut devices = read_devices_from_file(&path)?;

    // 주어진 ID와 일치하는 장치의 인덱스 찾기
    if let Some(index) = devices.iter().position(|d| d.id == updated_device.id) {
        println!("Updating device with ID: {}", updated_device.id);
        devices[index] = updated_device; // 찾은 위치의 장치 정보 업데이트
        write_devices_to_file(&path, &devices)?; // 변경된 목록을 파일에 저장
        Ok(devices) // 업데이트된 전체 장치 목록 반환
    } else {
        // 해당 ID의 장치를 찾지 못한 경우 에러 반환
        anyhow::bail!("ID '{}'를 가진 장치를 찾을 수 없어 업데이트할 수 없습니다.", updated_device.id)
    }
}

async fn delete_device_internal(app_handle: AppHandle, device_id: String) -> Result<Vec<Device>> {
    let path = get_config_path(&app_handle)?;
    let mut devices = read_devices_from_file(&path)?;

    let initial_len = devices.len();
    // 주어진 ID와 일치하지 않는 장치만 남기고 목록 필터링
    devices.retain(|d| d.id != device_id);

    // 삭제된 장치가 있는지 확인 (목록 길이가 줄었는지)
    if devices.len() == initial_len {
        anyhow::bail!("ID '{}'를 가진 장치를 찾을 수 없어 삭제할 수 없습니다.", device_id);
    }

    println!("Device with ID {} deleted.", device_id);
    write_devices_to_file(&path, &devices)?; // 변경된 목록을 파일에 저장
    Ok(devices) // 업데이트된 전체 장치 목록 반환
}


// --- Tauri Commands ---
// Tauri 커맨드 함수들은 Result<T, String>을 반환하여 프론트엔드로 결과를 전달
// 내부 로직 함수를 호출하고 anyhow::Error를 String으로 변환하여 반환

#[tauri::command]
pub async fn load_devices(app_handle: AppHandle) -> Result<Vec<Device>, String> {
    println!("Executing load_devices command..."); // 로그 추가
    load_devices_internal(app_handle).await.map_err(|e| {
        eprintln!("Error loading devices: {:?}", e); // 에러 로그
        e.to_string() // 에러 메시지 String 변환
    })
}

#[tauri::command]
pub async fn add_device(app_handle: AppHandle, device: Device) -> Result<Vec<Device>, String> {
    // 프론트엔드에서 device 객체를 전달받음 (ID는 여기서 생성되므로 무시됨)
    println!("Executing add_device command for: {}", device.name); // 로그 추가
    add_device_internal(app_handle, device).await.map_err(|e| {
        eprintln!("Error adding device: {:?}", e);
        e.to_string()
    })
}

#[tauri::command]
pub async fn update_device(app_handle: AppHandle, device: Device) -> Result<Vec<Device>, String> {
    // 프론트엔드에서 업데이트할 device 객체 (ID 포함)를 전달받음
    println!("Executing update_device command for: {}", device.name); // 로그 추가
    update_device_internal(app_handle, device).await.map_err(|e| {
        eprintln!("Error updating device: {:?}", e);
        e.to_string()
    })
}

#[tauri::command]
pub async fn delete_device(app_handle: AppHandle, device_id: String) -> Result<Vec<Device>, String> {
    // 프론트엔드에서 삭제할 device_id를 전달받음
    println!("Executing delete_device command for ID: {}", device_id); // 로그 추가
    delete_device_internal(app_handle, device_id).await.map_err(|e| {
        eprintln!("Error deleting device: {:?}", e);
        e.to_string()
    })
}
