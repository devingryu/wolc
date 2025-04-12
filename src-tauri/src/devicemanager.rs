use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::fs::{self, File};
use std::io::{BufReader, BufWriter, ErrorKind};
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};
use uuid::Uuid;

// Device 구조체에 port 필드 추가
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Device {
    id: String,
    name: String,
    mac: String,
    #[serde(rename = "targetAddr", skip_serializing_if = "Option::is_none")]
    target_addr: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    port: Option<u16>,
}

// --- Helper Functions ---

// 설정 디렉토리 내의 devices.json 파일 경로를 가져오는 함수
fn get_config_path(app_handle: &AppHandle) -> Result<PathBuf> {
    let config_dir = app_handle
        .path()
        .app_config_dir()
        .context("애플리케이션 설정 디렉토리를 가져올 수 없습니다.")?;

    if !config_dir.exists() {
        fs::create_dir_all(&config_dir)
            .with_context(|| format!("설정 디렉토리 생성 실패: {:?}", config_dir))?;
        println!("Config directory created at: {:?}", config_dir);
    }
    Ok(config_dir.join("devices.json"))
}

// JSON 파일에서 장치 목록을 읽어오는 함수 (port 필드 포함하여 역직렬화)
fn read_devices_from_file(path: &Path) -> Result<Vec<Device>> {
    match File::open(path) {
        Ok(file) => {
            let reader = BufReader::new(file);
            // 역직렬화 시 port 필드가 없으면 None으로 처리됨
            let devices: Vec<Device> = serde_json::from_reader(reader)
                .with_context(|| format!("장치 파일 역직렬화 실패: {:?}", path))?;
            Ok(devices)
        }
        Err(error) if error.kind() == ErrorKind::NotFound => {
            println!("Device file not found at {:?}, returning empty list.", path);
            Ok(Vec::new())
        }
        Err(error) => Err(error).with_context(|| format!("장치 파일 열기 실패: {:?}", path)),
    }
}

// 장치 목록을 JSON 파일에 쓰는 함수 (port 필드 포함하여 직렬화)
fn write_devices_to_file(path: &Path, devices: &[Device]) -> Result<()> {
    let file =
        File::create(path).with_context(|| format!("장치 파일 생성/열기 실패: {:?}", path))?;
    let writer = BufWriter::new(file);
    // 직렬화 시 port 필드가 Some일 경우만 JSON에 포함됨
    serde_json::to_writer_pretty(writer, devices)
        .with_context(|| format!("장치 파일 직렬화 실패: {:?}", path))?;
    Ok(())
}

// --- Internal Logic Functions (using anyhow::Result) ---

async fn load_devices_internal(app_handle: AppHandle) -> Result<Vec<Device>> {
    let path = get_config_path(&app_handle)?;
    println!("Reading devices from: {:?}", path);
    read_devices_from_file(&path)
}

// 추가되는 Device 데이터에 port 정보가 포함될 수 있음
async fn add_device_internal(
    app_handle: AppHandle,
    mut new_device_data: Device,
) -> Result<Vec<Device>> {
    let path = get_config_path(&app_handle)?;
    let mut devices = read_devices_from_file(&path)?;

    new_device_data.id = Uuid::new_v4().to_string();
    println!("Generated new device ID: {}", new_device_data.id);

    // TODO: 필요시 중복 검사 (예: 동일 MAC 주소)

    devices.push(new_device_data); // port 정보가 포함된 새 장치 추가
    write_devices_to_file(&path, &devices)?;
    println!("Device added. Total devices: {}", devices.len());
    Ok(devices)
}

// 업데이트되는 Device 데이터에 port 정보가 포함될 수 있음
async fn update_device_internal(
    app_handle: AppHandle,
    updated_device: Device,
) -> Result<Vec<Device>> {
    let path = get_config_path(&app_handle)?;
    let mut devices = read_devices_from_file(&path)?;

    if let Some(index) = devices.iter().position(|d| d.id == updated_device.id) {
        println!("Updating device with ID: {}", updated_device.id);
        devices[index] = updated_device; // port 정보가 포함된 장치 정보로 업데이트
        write_devices_to_file(&path, &devices)?;
        Ok(devices)
    } else {
        anyhow::bail!(
            "ID '{}'를 가진 장치를 찾을 수 없어 업데이트할 수 없습니다.",
            updated_device.id
        )
    }
}

async fn delete_device_internal(app_handle: AppHandle, device_id: String) -> Result<Vec<Device>> {
    let path = get_config_path(&app_handle)?;
    let mut devices = read_devices_from_file(&path)?;

    let initial_len = devices.len();
    devices.retain(|d| d.id != device_id);

    if devices.len() == initial_len {
        anyhow::bail!(
            "ID '{}'를 가진 장치를 찾을 수 없어 삭제할 수 없습니다.",
            device_id
        );
    }

    println!("Device with ID {} deleted.", device_id);
    write_devices_to_file(&path, &devices)?;
    Ok(devices)
}

// --- Tauri Commands ---

#[tauri::command]
pub async fn load_devices(app_handle: AppHandle) -> Result<Vec<Device>, String> {
    println!("Executing load_devices command...");
    load_devices_internal(app_handle).await.map_err(|e| {
        eprintln!("Error loading devices: {:?}", e);
        e.to_string()
    })
}

#[tauri::command]
pub async fn add_device(app_handle: AppHandle, device: Device) -> Result<Vec<Device>, String> {
    println!("Executing add_device command for: {}", device.name);
    // device 객체는 이제 port: Option<u16> 필드를 가질 수 있음
    add_device_internal(app_handle, device).await.map_err(|e| {
        eprintln!("Error adding device: {:?}", e);
        e.to_string()
    })
}

#[tauri::command]
pub async fn update_device(app_handle: AppHandle, device: Device) -> Result<Vec<Device>, String> {
    println!("Executing update_device command for: {}", device.name);
    // device 객체는 이제 port: Option<u16> 필드를 가질 수 있음
    update_device_internal(app_handle, device)
        .await
        .map_err(|e| {
            eprintln!("Error updating device: {:?}", e);
            e.to_string()
        })
}

#[tauri::command]
pub async fn delete_device(
    app_handle: AppHandle,
    device_id: String,
) -> Result<Vec<Device>, String> {
    println!("Executing delete_device command for ID: {}", device_id);
    delete_device_internal(app_handle, device_id)
        .await
        .map_err(|e| {
            eprintln!("Error deleting device: {:?}", e);
            e.to_string()
        })
}
