mod audio_player;
use crate::audio_player::AudioPlayer;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{Manager, Window, WindowEvent};

/// 显示并聚焦主窗口（托盘左键、菜单里都用得到）
fn show_main_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

#[tauri::command]
fn play(state: tauri::State<AudioPlayer>, window: Window, path: String) -> Result<(), String> {
    state.play(window, path)
}

/// 展开路径中的 Windows 环境变量，例如 %windir%\system32\notepad.exe
/// 快捷方式（.lnk）里常把目标存成环境变量形式，前端拿不到真实变量值，所以放到 Rust 侧处理。
/// Windows 的环境变量查询本身不区分大小写，未知变量保持原样。
#[tauri::command]
fn expand_env_path(path: String) -> String {
    let chars: Vec<char> = path.chars().collect();
    let mut out = String::with_capacity(path.len());
    let mut i = 0;
    while i < chars.len() {
        if chars[i] == '%' {
            if let Some(offset) = chars[i + 1..].iter().position(|c| *c == '%') {
                let name: String = chars[i + 1..i + 1 + offset].iter().collect();
                if !name.is_empty() && !name.contains('\\') && !name.contains('/') {
                    if let Ok(value) = std::env::var(&name) {
                        out.push_str(value.trim_end_matches(['\\', '/']));
                        i = i + offset + 2;
                        continue;
                    }
                }
            }
        }
        out.push(chars[i]);
        i += 1;
    }
    out
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let player = audio_player::AudioPlayer::new();

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs_pro::init())
        .setup(move |app: &mut tauri::App| {
            app.manage(player);

            // 托盘：左键显示窗口，右键弹出菜单（目前只有「退出」）
            let quit = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&quit])?;
            let mut builder = TrayIconBuilder::with_id("main-tray")
                .tooltip("XToolKit")
                .menu(&menu)
                // 左键不要弹菜单，留给「显示窗口」
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| {
                    if event.id().as_ref() == "quit" {
                        app.exit(0);
                    }
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        show_main_window(tray.app_handle());
                    }
                });
            if let Some(icon) = app.default_window_icon().cloned() {
                builder = builder.icon(icon);
            }
            builder.build(app)?;

            Ok(())
        })
        // 关窗口只是收进托盘，真正退出走托盘菜单的「退出」
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .invoke_handler(tauri::generate_handler![play, expand_env_path])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
