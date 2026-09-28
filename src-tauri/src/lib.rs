mod audio_player;
use crate::audio_player::AudioPlayer;
use tauri::Manager;
use tauri::Window;

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
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![play, expand_env_path])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
