mod commands;
mod fs;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            commands::get_library_state,
            commands::choose_library_root,
            commands::read_scene,
            commands::write_scene,
            commands::create_drawing,
            commands::create_folder,
        ])
        .run(tauri::generate_context!())
        .expect("error while running LocalCanvas");
}
