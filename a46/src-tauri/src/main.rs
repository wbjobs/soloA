#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

use network_analyzer_lib::{
    get_interfaces,
    start_capture,
    stop_capture,
    get_packets,
    get_packet,
    get_protocol_stats,
    get_traffic_stats,
    get_top_talkers,
    get_tcp_streams,
    get_tcp_stream,
    clear_packets,
    compile_bpf_filter,
    set_display_filter,
    init_database,
    start_packet_forwarder,
};

fn main() {
    let _ = init_database();

    tauri::Builder::default()
        .setup(|app| {
            let app_handle = app.handle();
            start_packet_forwarder(app_handle);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_interfaces,
            start_capture,
            stop_capture,
            get_packets,
            get_packet,
            get_protocol_stats,
            get_traffic_stats,
            get_top_talkers,
            get_tcp_streams,
            get_tcp_stream,
            clear_packets,
            compile_bpf_filter,
            set_display_filter,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
