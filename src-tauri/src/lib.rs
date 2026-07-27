mod commands;
mod fs;
mod index;
mod watcher;

use tauri::{
    menu::{MenuBuilder, MenuItemBuilder, SubmenuBuilder},
    Emitter,
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
            let command_palette = MenuItemBuilder::with_id("command-palette", "Search Drawings")
                .accelerator("CmdOrCtrl+K")
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
            | "command-palette" => {
                let _ = app.emit("menu-action", event.id().as_ref());
            }
            _ => {}
        })
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            commands::get_library_state,
            commands::choose_library_root,
            commands::rebuild_index,
            commands::search_drawings,
            commands::get_graph,
            commands::get_backlinks,
            commands::record_drawing_opened,
            commands::set_drawing_pinned,
            commands::read_scene,
            commands::write_scene,
            commands::export_file,
            commands::read_thumbnail,
            commands::write_thumbnail,
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
