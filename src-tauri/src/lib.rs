mod devicemanager;
mod wol;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            // 기존 커맨드
            wol::send_wol_packet,
            // 새로 추가된 장치 관리 커맨드
            devicemanager::load_devices,
            devicemanager::add_device,
            devicemanager::update_device,
            devicemanager::delete_device
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
