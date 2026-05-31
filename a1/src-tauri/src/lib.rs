mod audio;
mod db;

use db::{get_all_tag_stats, get_saved_tags, get_today_stats, get_today_tag_stats, save_pomodoro_with_tag, DailyStats, SavedTag, TagStats};
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager,
};
use tauri_plugin_notification::NotificationExt;

pub struct AppState {
    pub db_path: PathBuf,
    pub timer_status: Mutex<String>,
}

fn get_db_path(app: &AppHandle) -> PathBuf {
    let mut path = app.path().app_data_dir().expect("Failed to get app data dir");
    path.push("pomodoro.db");
    path
}

fn request_notification_permission(app: &AppHandle) {
    if let Err(e) = app.notification().request_permission() {
        eprintln!("Failed to request notification permission: {}", e);
    }
}

fn send_notification(app: &AppHandle, title: &str, body: &str) {
    let result = app
        .notification()
        .builder()
        .title(title)
        .body(body)
        .show();
    
    if let Err(e) = result {
        eprintln!("Failed to send notification: {}", e);
    }
}

#[tauri::command]
fn start_timer(app: AppHandle) {
    if let Some(state) = app.try_state::<AppState>() {
        if let Ok(mut status) = state.timer_status.lock() {
            *status = "running".to_string();
        }
    }
    let _ = app.emit("timer-start", ());
}

#[tauri::command]
fn pause_timer(app: AppHandle) {
    if let Some(state) = app.try_state::<AppState>() {
        if let Ok(mut status) = state.timer_status.lock() {
            *status = "paused".to_string();
        }
    }
    let _ = app.emit("timer-pause", ());
}

#[tauri::command]
fn reset_timer(app: AppHandle) {
    if let Some(state) = app.try_state::<AppState>() {
        if let Ok(mut status) = state.timer_status.lock() {
            *status = "idle".to_string();
        }
    }
    let _ = app.emit("timer-reset", ());
}

#[tauri::command]
fn save_pomodoro_record(
    app: AppHandle, 
    duration: i32, 
    tag: Option<String>
) -> Result<(), String> {
    if let Some(state) = app.try_state::<AppState>() {
        let tag_ref = tag.as_deref();
        save_pomodoro_with_tag(&state.db_path, duration, tag_ref).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn get_today_stats_data(app: AppHandle) -> Result<DailyStats, String> {
    if let Some(state) = app.try_state::<AppState>() {
        get_today_stats(&state.db_path).map_err(|e| e.to_string())
    } else {
        Ok(DailyStats {
            count: 0,
            total_seconds: 0,
        })
    }
}

#[tauri::command]
fn get_today_tag_stats_data(app: AppHandle) -> Result<Vec<TagStats>, String> {
    if let Some(state) = app.try_state::<AppState>() {
        get_today_tag_stats(&state.db_path).map_err(|e| e.to_string())
    } else {
        Ok(vec![])
    }
}

#[tauri::command]
fn get_all_tag_stats_data(app: AppHandle) -> Result<Vec<TagStats>, String> {
    if let Some(state) = app.try_state::<AppState>() {
        get_all_tag_stats(&state.db_path).map_err(|e| e.to_string())
    } else {
        Ok(vec![])
    }
}

#[tauri::command]
fn get_saved_tags_data(app: AppHandle) -> Result<Vec<SavedTag>, String> {
    if let Some(state) = app.try_state::<AppState>() {
        get_saved_tags(&state.db_path).map_err(|e| e.to_string())
    } else {
        Ok(vec![])
    }
}

#[tauri::command]
fn update_tray_timer(app: AppHandle, remaining: i32, status: String) {
    if let Some(tray) = app.tray_by_id("main-tray") {
        let minutes = remaining / 60;
        let seconds = remaining % 60;
        let timer_text = format!("{:02}:{:02}", minutes, seconds);
        let status_label = match status.as_str() {
            "running" => "运行中",
            "paused" => "已暂停",
            "completed" => "已完成",
            _ => "空闲",
        };
        let _ = tray.set_tooltip(Some(format!("番茄钟 - {} ({})", timer_text, status_label)));
    }
}

#[tauri::command]
fn timer_complete(
    app: AppHandle, 
    duration: i32, 
    mode: String, 
    tag: Option<String>
) -> Result<(), String> {
    if let Some(state) = app.try_state::<AppState>() {
        if mode == "work" {
            let tag_ref = tag.as_deref();
            save_pomodoro_with_tag(&state.db_path, duration, tag_ref).map_err(|e| e.to_string())?;
        }
    }

    let title = "番茄钟完成！";
    let body = if mode == "work" {
        "太棒了！休息一下吧。"
    } else {
        "休息结束，开始专注！"
    };

    send_notification(&app, title, body);

    std::thread::spawn(|| {
        audio::play_notification_sound();
    });

    Ok(())
}

fn show_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .setup(|app| {
            let db_path = get_db_path(app.handle());
            db::init_db(&db_path).expect("Failed to initialize database");

            app.manage(AppState {
                db_path,
                timer_status: Mutex::new("idle".to_string()),
            });

            request_notification_permission(app.handle());

            let start_item = MenuItem::with_id(app, "start", "开始", true, None::<&str>)?;
            let pause_item = MenuItem::with_id(app, "pause", "暂停", true, None::<&str>)?;
            let reset_item = MenuItem::with_id(app, "reset", "重置", true, None::<&str>)?;
            let show_item = MenuItem::with_id(app, "show", "显示窗口", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;

            let menu = Menu::with_items(app, &[&start_item, &pause_item, &reset_item, &show_item, &quit_item])?;

            let _tray = TrayIconBuilder::with_id("main-tray")
                .tooltip("番茄钟")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id().as_ref() {
                    "start" => {
                        let _ = app.emit("timer-start", ());
                    }
                    "pause" => {
                        let _ = app.emit("timer-pause", ());
                    }
                    "reset" => {
                        let _ = app.emit("timer-reset", ());
                    }
                    "show" => {
                        show_main_window(app);
                    }
                    "quit" => {
                        app.exit(0);
                    }
                    _ => {}
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
                })
                .build(app)?;

            let main_window = tauri::WebviewWindowBuilder::new(
                app,
                "main",
                tauri::WebviewUrl::App("index.html".into()),
            )
            .title("番茄钟")
            .inner_size(400.0, 600.0)
            .resizable(false)
            .build()?;

            let _floating_window = tauri::WebviewWindowBuilder::new(
                app,
                "floating",
                tauri::WebviewUrl::App("floating.html".into()),
            )
            .title("")
            .decorations(false)
            .transparent(true)
            .always_on_top(true)
            .skip_taskbar(true)
            .inner_size(80.0, 80.0)
            .resizable(false)
            .build()?;

            let _ = main_window.show();

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            start_timer,
            pause_timer,
            reset_timer,
            save_pomodoro_record,
            get_today_stats_data,
            get_today_tag_stats_data,
            get_all_tag_stats_data,
            get_saved_tags_data,
            update_tray_timer,
            timer_complete,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
