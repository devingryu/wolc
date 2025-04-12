use anyhow::{Context, Result}; // anyhow의 Context와 Result를 가져옵니다.
use wakey; // wakey 크레이트 사용

// 내부 로직을 처리하는 별도의 비동기 함수입니다.
// 이 함수는 anyhow::Result를 반환하여 '?' 연산자를 통한 간결한 오류 처리를 가능하게 합니다.
async fn send_wol_packet_internal(
    mac_address: String,
    target_addr: Option<String>,
    port: Option<u16>,
) -> Result<()> {
    let target_port = port.unwrap_or(9);
    println!(
        "Attempting to send WOL packet to MAC: {} via target: {:?}:{}",
        mac_address,
        target_addr.as_deref().unwrap_or("default broadcast"),
        target_port
    );

    // 1. MAC 주소 파싱
    // wakey 크레이트의 기능을 사용하여 문자열 형태의 MAC 주소를 파싱합니다.
    let target_mac = wakey::WolPacket::from_string(&mac_address, ':')
        .with_context(|| format!("Invalid MAC address format provided: '{}'", mac_address))?;

    // 2. 대상 주소 결정 (target_addr 사용)
    // target_addr 인자가 제공되면 해당 값을 사용하고, 아니면 기본 브로드캐스트 주소("255.255.255.255")를 사용합니다.
    let target_addr_str = target_addr.unwrap_or_else(|| "255.255.255.255".to_string());
    let target_socket_addr = format!("{}:{}", target_addr_str, target_port);
    println!("Resolved target socket address: {}", target_socket_addr);

    // 3. 매직 패킷 전송
    // 파싱된 MAC 주소와 결정된 소켓 주소로 매직 패킷을 전송합니다.
    target_mac.send_magic().with_context(|| {
        format!(
            "Failed to send WOL packet to MAC {} via {}",
            mac_address, target_socket_addr
        )
    })?;

    println!("WOL packet sent successfully to {}", mac_address); // 성공 로그
    Ok(()) // 성공 시 Ok 반환
}

// Tauri 커맨드로 정의하여 프론트엔드(JavaScript/TypeScript)에서 호출할 수 있도록 합니다.
// 이 함수는 프론트엔드와의 직접적인 인터페이스 역할을 합니다.
#[tauri::command]
pub async fn send_wol_packet(
    mac_address: String,
    target_addr: Option<String>,
    port: Option<u16>,
) -> Result<(), String> {
    // 내부 로직 함수를 호출하고 결과를 처리합니다.
    send_wol_packet_internal(mac_address, target_addr, port)
        .await
        .map_err(|e| {
            // anyhow::Error를 String으로 변환합니다.
            eprintln!("Error sending WOL packet: {:?}", e);
            e.to_string() // 프론트엔드로 전달될 최종 에러 메시지 (String)
        })
}
