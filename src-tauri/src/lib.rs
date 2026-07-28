mod commands;
mod fs;
mod index;
mod ocr;
mod speech;
mod watcher;

use tauri::{
    menu::{MenuBuilder, MenuItemBuilder, SubmenuBuilder},
    tray::TrayIconBuilder,
    Emitter, Manager,
};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(watcher::LibraryWatcher::default())
        .setup(|app| {
            let new_drawing = MenuItemBuilder::with_id("new-drawing", "New Drawing")
                .accelerator("CmdOrCtrl+N")
                .build(app)?;
            let new_folder = MenuItemBuilder::with_id("new-folder", "New Folder")
                .accelerator("CmdOrCtrl+Shift+N")
                .build(app)?;
            let import_drawing =
                MenuItemBuilder::with_id("import-drawing", "Import Excalidraw Drawing…")
                    .accelerator("CmdOrCtrl+O")
                    .build(app)?;
            let rename = MenuItemBuilder::with_id("rename-active", "Rename")
                .accelerator("CmdOrCtrl+R")
                .build(app)?;
            let command_palette = MenuItemBuilder::with_id("command-palette", "Command Palette…")
                .accelerator("CmdOrCtrl+K")
                .build(app)?;
            let toggle_layers = MenuItemBuilder::with_id("toggle-layers", "Layers")
                .accelerator("CmdOrCtrl+Shift+L")
                .build(app)?;
            let record_voice_note = MenuItemBuilder::with_id("record-voice-note", "Record Voice Note")
                .accelerator("CmdOrCtrl+Shift+V")
                .build(app)?;
            let quick_capture =
                MenuItemBuilder::with_id("quick-capture", "New Quick Canvas").build(app)?;
            let show_window =
                MenuItemBuilder::with_id("show-window", "Show LocalCanvas").build(app)?;
            let tray_menu = MenuBuilder::new(app)
                .item(&quick_capture)
                .item(&show_window)
                .separator()
                .quit()
                .build()?;
            let tray_icon = app
                .default_window_icon()
                .cloned()
                .ok_or_else(|| "LocalCanvas needs an application icon for quick capture.")?;
            TrayIconBuilder::with_id("quick-capture")
                .icon(tray_icon)
                .icon_as_template(true)
                .tooltip("LocalCanvas")
                .menu(&tray_menu)
                .on_menu_event(|app, event| match event.id().as_ref() {
                    "quick-capture" => {
                        show_main_window(app);
                        let _ = app.emit("menu-action", "quick-capture");
                    }
                    "show-window" => show_main_window(app),
                    _ => {}
                })
                .build(app)?;

            let app_menu = SubmenuBuilder::new(app, "LocalCanvas")
                .about(None)
                .separator()
                .services()
                .separator()
                .hide()
                .hide_others()
                .show_all()
                .separator()
                .quit()
                .build()?;
            let file_menu = SubmenuBuilder::new(app, "File")
                .item(&new_drawing)
                .item(&new_folder)
                .item(&import_drawing)
                .item(&record_voice_note)
                .separator()
                .item(&rename)
                .build()?;
            let edit_menu = SubmenuBuilder::new(app, "Edit")
                .undo()
                .redo()
                .separator()
                .cut()
                .copy()
                .paste()
                .select_all()
                .build()?;
            let view_menu = SubmenuBuilder::new(app, "View")
                .item(&command_palette)
                .item(&toggle_layers)
                .separator()
                .fullscreen()
                .build()?;
            let window_menu = SubmenuBuilder::new(app, "Window")
                .minimize()
                .separator()
                .close_window()
                .build()?;

            app.set_menu(
                MenuBuilder::new(app)
                    .item(&app_menu)
                    .item(&file_menu)
                    .item(&edit_menu)
                    .item(&view_menu)
                    .item(&window_menu)
                    .build()?,
            )?;
            Ok(())
        })
        .on_menu_event(|app, event| match event.id().as_ref() {
            "new-drawing" | "new-folder" | "import-drawing" | "rename-active"
            | "command-palette" | "toggle-layers" | "record-voice-note" => {
                let _ = app.emit("menu-action", event.id().as_ref());
            }
            _ => {}
        })
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_deep_link::init())
        .invoke_handler(tauri::generate_handler![
            commands::get_library_state,
            commands::choose_library_root,
            commands::rebuild_index,
            commands::search_drawings,
            commands::resolve_drawing_id,
            commands::get_graph,
            commands::get_backlinks,
            commands::record_drawing_opened,
            commands::set_drawing_pinned,
            commands::set_history_enabled,
            commands::read_scene,
            commands::write_scene,
            commands::list_scene_versions,
            commands::read_scene_version,
            commands::restore_scene_version,
            commands::read_thumbnail,
            commands::write_thumbnail,
            commands::write_voice_note,
            commands::read_voice_note,
            commands::delete_voice_note,
            commands::transcribe_voice_note,
            commands::read_dropped_image,
            commands::recognize_image_text,
            commands::pick_import_scene,
            commands::create_drawing,
            commands::create_folder,
            commands::get_drawing_tags,
            commands::set_drawing_tags,
            commands::delete_drawing,
            commands::delete_folder,
            commands::rename_drawing,
            commands::rename_folder,
            commands::move_drawing,
            commands::move_folder,
        ])
        .run(tauri::generate_context!())
        .expect("error while running LocalCanvas");
}

fn show_main_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}
