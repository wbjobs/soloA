#[macro_use]
extern crate log;

mod mod_imports {
    pub use eframe::egui;
    pub use egui::plot::{Line, Plot, PlotPoints, Value};
    pub use crate::particle::{ParticleType, InteractionRules};
    pub use crate::simulation::{Simulation, SimulationConfig, BoundaryType};
    pub use crate::protocol::{ClientMessage, ServerMessage, ConnectionState, UserInfo, UserAction, ControlAction, HistorySnapshot};
    pub use crate::client::network::NetworkClient;
    pub use serde::{Deserialize, Serialize};
    pub use std::fs;
    pub use std::path::Path;
    pub use uuid::Uuid;
    pub use chrono::{DateTime, Utc};
}

use mod_imports::*;

fn main() -> Result<(), eframe::Error> {
    env_logger::init();
    
    let options = eframe::NativeOptions {
        initial_window_size: Some(egui::vec2(1400.0, 900.0)),
        min_window_size: Some(egui::vec2(1000.0, 700.0)),
        ..Default::default()
    };
    
    eframe::run_native(
        "粒子生命模拟 - 网络版 (Particle Life - Networked)",
        options,
        Box::new(|_cc| Box::new(ParticleSimulationApp::new())),
    )
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct AppConfig {
    simulation: SimulationConfig,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            simulation: SimulationConfig::default(),
        }
    }
}

struct ParticleSimulationApp {
    simulation: Simulation,
    config: AppConfig,
    selected_tool: Tool,
    add_particle_type: ParticleType,
    brush_size: f32,
    last_config_path: Option<String>,
    show_rules_window: bool,
    
    network_client: NetworkClient,
    server_url: String,
    user_name: String,
    is_host_mode: bool,
    
    chat_messages: Vec<ChatMessageItem>,
    chat_input: String,
    show_chat: bool,
    
    status_messages: Vec<StatusMessage>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Tool {
    Select,
    AddParticle,
    RemoveParticle,
}

#[derive(Debug, Clone)]
struct ChatMessageItem {
    user_name: String,
    content: String,
    timestamp: DateTime<Utc>,
    is_system: bool,
}

#[derive(Debug, Clone)]
struct StatusMessage {
    content: String,
    timestamp: DateTime<Utc>,
    is_error: bool,
}

impl ParticleSimulationApp {
    fn new() -> Self {
        let config = AppConfig::default();
        let simulation = Simulation::new(config.simulation.clone());
        
        Self {
            simulation,
            config,
            selected_tool: Tool::AddParticle,
            add_particle_type: ParticleType::A,
            brush_size: 20.0,
            last_config_path: None,
            show_rules_window: false,
            
            network_client: NetworkClient::new(),
            server_url: "ws://127.0.0.1:8080".to_string(),
            user_name: format!("用户_{}", rand::random::<u32>() % 10000),
            is_host_mode: false,
            
            chat_messages: Vec::new(),
            chat_input: String::new(),
            show_chat: false,
            
            status_messages: Vec::new(),
        }
    }

    fn add_status_message(&mut self, content: String, is_error: bool) {
        self.status_messages.push(StatusMessage {
            content,
            timestamp: Utc::now(),
            is_error,
        });
        
        while self.status_messages.len() > 50 {
            self.status_messages.remove(0);
        }
    }

    fn process_network_messages(&mut self) {
        let messages = self.network_client.poll_messages();
        
        for msg in messages {
            self.handle_server_message(msg);
        }
    }

    fn handle_server_message(&mut self, msg: ServerMessage) {
        match msg {
            ServerMessage::Welcome { user_id, server_time, users } => {
                self.add_status_message(format!("连接成功！用户ID: {}", user_id), false);
                self.add_status_message(format!("服务器时间: {}", server_time), false);
            }
            
            ServerMessage::UserJoined { user } => {
                self.add_status_message(format!("用户 '{}' 加入了房间", user.name), false);
                self.chat_messages.push(ChatMessageItem {
                    user_name: "系统".to_string(),
                    content: format!("用户 '{}' 加入了房间", user.name),
                    timestamp: Utc::now(),
                    is_system: true,
                });
            }
            
            ServerMessage::UserLeft { user_id } => {
                let users = self.network_client.users.lock().unwrap().clone();
                if let Some(user) = users.iter().find(|u| u.id == user_id) {
                    self.add_status_message(format!("用户 '{}' 离开了房间", user.name), false);
                    self.chat_messages.push(ChatMessageItem {
                        user_name: "系统".to_string(),
                        content: format!("用户 '{}' 离开了房间", user.name),
                        timestamp: Utc::now(),
                        is_system: true,
                    });
                }
            }
            
            ServerMessage::FullState { particles, config, is_running, population_counts, timestamp } => {
                if !self.is_host_mode {
                    self.simulation.particles = particles;
                    self.simulation.config = config;
                    self.simulation.is_running = is_running;
                    self.add_status_message(format!("同步状态完成，{}个粒子", self.simulation.particles.len()), false);
                }
            }
            
            ServerMessage::StateDelta { added_particles, removed_particle_indices, particle_updates, config_update, is_running, timestamp } => {
                if !self.is_host_mode {
                    for particle in added_particles {
                        self.simulation.particles.push(particle);
                    }
                    
                    for &idx in &removed_particle_indices {
                        if idx < self.simulation.particles.len() {
                            self.simulation.particles.remove(idx);
                        }
                    }
                    
                    for update in particle_updates {
                        if let Some(particle) = self.simulation.particles.get_mut(update.index) {
                            if let Some(x) = update.x { particle.x = x; }
                            if let Some(y) = update.y { particle.y = y; }
                            if let Some(vx) = update.vx { particle.vx = vx; }
                            if let Some(vy) = update.vy { particle.vy = vy; }
                        }
                    }
                    
                    if let Some(config) = config_update {
                        self.simulation.config = config;
                    }
                    
                    if let Some(running) = is_running {
                        self.simulation.is_running = running;
                    }
                }
            }
            
            ServerMessage::ChatMessage { user_id, user_name, content, timestamp } => {
                self.chat_messages.push(ChatMessageItem {
                    user_name,
                    content,
                    timestamp,
                    is_system: false,
                });
            }
            
            ServerMessage::UserAction { user_id, user_name, action, timestamp } => {
                let message = match action {
                    UserAction::AddedParticle { x, y, particle_type } => {
                        format!("用户 '{}' 在 ({:.1}, {:.1}) 添加了类型 {:?} 的粒子", user_name, x, y, particle_type)
                    }
                    UserAction::RemovedParticles { x, y, radius, count } => {
                        format!("用户 '{}' 在 ({:.1}, {:.1}) 删除了 {} 个粒子", user_name, x, y, count)
                    }
                    UserAction::ChangedConfig => {
                        format!("用户 '{}' 修改了配置", user_name)
                    }
                    UserAction::StartedSimulation => {
                        format!("用户 '{}' 开始了模拟", user_name)
                    }
                    UserAction::PausedSimulation => {
                        format!("用户 '{}' 暂停了模拟", user_name)
                    }
                    UserAction::ResetSimulation => {
                        format!("用户 '{}' 重置了模拟", user_name)
                    }
                };
                
                self.add_status_message(message, false);
            }
            
            ServerMessage::HistoryResponse { snapshots } => {
                self.add_status_message(format!("收到 {} 个历史快照", snapshots.len()), false);
            }
            
            ServerMessage::Error { message } => {
                self.add_status_message(format!("服务器错误: {}", message), true);
            }
        }
    }

    fn draw_particles(&self, ui: &mut egui::Ui) -> egui::Response {
        let (response, painter) = ui.allocate_painter(
            ui.available_size(),
            egui::Sense::click_and_drag(),
        );

        let canvas_rect = response.rect;
        let sim_width = self.simulation.config.width;
        let sim_height = self.simulation.config.height;

        let scale_x = canvas_rect.width() / sim_width;
        let scale_y = canvas_rect.height() / sim_height;

        for particle in &self.simulation.particles {
            let screen_pos = egui::Pos2::new(
                canvas_rect.min.x + particle.x * scale_x,
                canvas_rect.min.y + particle.y * scale_y,
            );
            let color = particle.particle_type.color();
            let color = egui::Color32::from_rgb(
                (color[0] * 255.0) as u8,
                (color[1] * 255.0) as u8,
                (color[2] * 255.0) as u8,
            );
            painter.circle_filled(screen_pos, 2.0, color);
        }

        response
    }

    fn handle_mouse_interaction(&mut self, ui: &mut egui::Ui, canvas_response: &egui::Response) {
        if canvas_response.hovered() || canvas_response.dragged() {
            let canvas_rect = canvas_response.rect;
            let sim_width = self.simulation.config.width;
            let sim_height = self.simulation.config.height;

            let scale_x = sim_width / canvas_rect.width();
            let scale_y = sim_height / canvas_rect.height();

            if let Some(pos) = ui.input(|i| i.pointer.hover_pos()) {
                if canvas_rect.contains(pos) {
                    let sim_x = (pos.x - canvas_rect.min.x) * scale_x;
                    let sim_y = (pos.y - canvas_rect.min.y) * scale_y;

                    if ui.input(|i| i.pointer.primary_down()) {
                        match self.selected_tool {
                            Tool::AddParticle => {
                                let count = if ui.input(|i| i.pointer.delta().length() > 5.0) {
                                    3
                                } else {
                                    1
                                };
                                for _ in 0..count {
                                    let offset_x = (rand::random::<f32>() - 0.5) * self.brush_size;
                                    let offset_y = (rand::random::<f32>() - 0.5) * self.brush_size;
                                    let x = (sim_x + offset_x).clamp(0.0, sim_width);
                                    let y = (sim_y + offset_y).clamp(0.0, sim_height);
                                    
                                    if self.network_client.is_connected() {
                                        self.network_client.send(ClientMessage::AddParticle {
                                            x, y, particle_type: self.add_particle_type,
                                        });
                                    } else {
                                        self.simulation.add_particle(x, y, self.add_particle_type);
                                    }
                                }
                            }
                            Tool::RemoveParticle => {
                                if self.network_client.is_connected() {
                                    self.network_client.send(ClientMessage::RemoveParticles {
                                        x: sim_x, y: sim_y, radius: self.brush_size,
                                    });
                                } else {
                                    self.simulation.remove_particles_at(sim_x, sim_y, self.brush_size);
                                }
                            }
                            Tool::Select => {}
                        }
                    }

                    if ui.input(|i| i.pointer.secondary_down()) {
                        if self.network_client.is_connected() {
                            self.network_client.send(ClientMessage::RemoveParticles {
                                x: sim_x, y: sim_y, radius: self.brush_size,
                            });
                        } else {
                            self.simulation.remove_particles_at(sim_x, sim_y, self.brush_size);
                        }
                    }
                }
            }
        }
    }

    fn draw_population_chart(&self, ui: &mut egui::Ui) {
        ui.label("种群数量 (Population)");

        let history = &self.simulation.population_history;
        if history.counts.len() < 2 {
            ui.label("等待数据...");
            return;
        }

        let plot_points_a: PlotPoints = history
            .counts
            .iter()
            .enumerate()
            .map(|(i, c)| [i as f64, c[0] as f64])
            .collect();

        let plot_points_b: PlotPoints = history
            .counts
            .iter()
            .enumerate()
            .map(|(i, c)| [i as f64, c[1] as f64])
            .collect();

        let plot_points_c: PlotPoints = history
            .counts
            .iter()
            .enumerate()
            .map(|(i, c)| [i as f64, c[2] as f64])
            .collect();

        let line_a = Line::new(plot_points_a)
            .color(egui::Color32::RED)
            .name("Type A");
        let line_b = Line::new(plot_points_b)
            .color(egui::Color32::GREEN)
            .name("Type B");
        let line_c = Line::new(plot_points_c)
            .color(egui::Color32::BLUE)
            .name("Type C");

        Plot::new("population_plot")
            .view_aspect(2.0)
            .legend(egui::plot::Legend::default())
            .show(ui, |plot_ui| {
                plot_ui.line(line_a);
                plot_ui.line(line_b);
                plot_ui.line(line_c);
            });
    }

    fn draw_fps_chart(&self, ui: &mut egui::Ui) {
        ui.label("帧率 (FPS)");

        let history = &self.simulation.population_history;
        if history.fps.len() < 2 {
            ui.label("等待数据...");
            return;
        }

        let plot_points: PlotPoints = history
            .fps
            .iter()
            .enumerate()
            .map(|(i, fps)| [i as f64, *fps as f64])
            .collect();

        let line = Line::new(plot_points)
            .color(egui::Color32::YELLOW);

        Plot::new("fps_plot")
            .view_aspect(3.0)
            .show(ui, |plot_ui| {
                plot_ui.line(line);
            });
    }

    fn show_network_panel(&mut self, ui: &mut egui::Ui) {
        ui.heading("🌐 网络连接");
        ui.separator();

        let connection_state = self.network_client.connection_state.lock().unwrap().clone();
        let state_text = match &connection_state {
            ConnectionState::Disconnected => "未连接",
            ConnectionState::Connecting => "连接中...",
            ConnectionState::Connected => "已连接 ✓",
            ConnectionState::Error(e) => &format!("错误: {}", e),
        };
        
        let state_color = match &connection_state {
            ConnectionState::Disconnected => egui::Color32::GRAY,
            ConnectionState::Connecting => egui::Color32::YELLOW,
            ConnectionState::Connected => egui::Color32::GREEN,
            ConnectionState::Error(_) => egui::Color32::RED,
        };
        
        ui.colored_label(state_color, state_text);
        ui.add_space(10.0);

        if !matches!(connection_state, ConnectionState::Connected) {
            ui.label("服务器地址:");
            ui.text_edit_singleline(&mut self.server_url);
            
            ui.label("用户名:");
            ui.text_edit_singleline(&mut self.user_name);
            
            ui.add_space(5.0);
            ui.checkbox(&mut self.is_host_mode, "主机模式 (本地计算)");
            
            if ui.button("🔌 连接服务器").clicked() {
                self.network_client.connect(&self.server_url, self.user_name.clone());
                self.add_status_message(format!("正在连接到 {}...", self.server_url), false);
            }
        } else {
            ui.label(format!("已连接到: {}", self.server_url));
            ui.label(format!("用户名: {}", self.user_name));
            
            if self.is_host_mode {
                ui.label("🏠 主机模式: 本地计算 + 同步到服务器");
            } else {
                ui.label("👥 客户端模式: 从服务器接收状态");
            }
            
            if ui.button("🔌 断开连接").clicked() {
                self.network_client.disconnect();
                self.add_status_message("已断开连接".to_string(), false);
            }
            
            ui.separator();
            
            let users = self.network_client.users.lock().unwrap().clone();
            ui.label(format!("在线用户: {} 人", users.len()));
            for user in users {
                let text = if user.is_host {
                    format!("👑 {} (主机)", user.name)
                } else {
                    format!("👤 {}", user.name)
                };
                ui.label(text);
            }
        }

        ui.separator();
        
        if ui.button("💬 聊天").clicked() {
            self.show_chat = !self.show_chat;
        }
    }

    fn show_chat_window(&mut self, ctx: &egui::Context) {
        if !self.show_chat {
            return;
        }

        egui::Window::new("💬 聊天室")
            .open(&mut self.show_chat)
            .default_size(egui::vec2(350.0, 400.0))
            .show(ctx, |ui| {
                egui::ScrollArea::vertical()
                    .auto_shrink([false; 2])
                    .show(ui, |ui| {
                        for msg in &self.chat_messages {
                            if msg.is_system {
                                ui.colored_label(egui::Color32::GRAY, &msg.content);
                            } else {
                                ui.horizontal(|ui| {
                                    ui.colored_label(egui::Color32::BLUE, format!("{}: ", msg.user_name));
                                    ui.label(&msg.content);
                                });
                            }
                        }
                    });

                ui.separator();
                
                if self.network_client.is_connected() {
                    ui.horizontal(|ui| {
                        ui.text_edit_singleline(&mut self.chat_input);
                        if ui.button("发送").clicked() && !self.chat_input.is_empty() {
                            self.network_client.send(ClientMessage::ChatMessage {
                                content: self.chat_input.clone(),
                            });
                            self.chat_input.clear();
                        }
                    });
                } else {
                    ui.label("请先连接服务器");
                }
            });
    }

    fn show_status_panel(&mut self, ui: &mut egui::Ui) {
        ui.heading("📋 状态日志");
        ui.separator();
        
        egui::ScrollArea::vertical()
            .max_height(150.0)
            .show(ui, |ui| {
                for msg in self.status_messages.iter().rev().take(20) {
                    let color = if msg.is_error {
                        egui::Color32::RED
                    } else {
                        egui::Color32::LIGHT_GRAY
                    };
                    ui.colored_label(color, format!("[{}] {}", msg.timestamp.format("%H:%M:%S"), msg.content));
                }
            });
    }

    fn show_control_panel(&mut self, ctx: &egui::Context) {
        egui::SidePanel::left("control_panel")
            .default_width(300.0)
            .show(ctx, |ui| {
                ui.heading("控制面板 (Control Panel)");
                ui.separator();

                ui.horizontal(|ui| {
                    if ui.button("▶ 开始").clicked() {
                        if self.network_client.is_connected() {
                            self.network_client.send(ClientMessage::ControlAction {
                                action: ControlAction::Start,
                            });
                        }
                        self.simulation.is_running = true;
                    }
                    if ui.button("⏸ 暂停").clicked() {
                        if self.network_client.is_connected() {
                            self.network_client.send(ClientMessage::ControlAction {
                                action: ControlAction::Pause,
                            });
                        }
                        self.simulation.is_running = false;
                    }
                    if ui.button("⟲ 重置").clicked() {
                        if self.network_client.is_connected() {
                            self.network_client.send(ClientMessage::ControlAction {
                                action: ControlAction::Reset,
                            });
                        }
                        self.simulation.reset();
                    }
                });

                ui.separator();
                ui.label("演化速度:");
                let old_speed = self.simulation.evolution_speed;
                ui.add(egui::Slider::new(&mut self.simulation.evolution_speed, 0.1..=5.0)
                    .text("x"));
                    
                if (self.simulation.evolution_speed - old_speed).abs() > 0.01 {
                    if self.network_client.is_connected() {
                        self.network_client.send(ClientMessage::ControlAction {
                            action: ControlAction::SetSpeed(self.simulation.evolution_speed),
                        });
                    }
                }

                ui.separator();

                self.show_network_panel(ui);

                ui.separator();

                ui.heading("工具 (Tools)");
                ui.horizontal(|ui| {
                    ui.selectable_value(&mut self.selected_tool, Tool::AddParticle, "➕ 添加");
                    ui.selectable_value(&mut self.selected_tool, Tool::RemoveParticle, "➖ 删除");
                });

                if self.selected_tool == Tool::AddParticle {
                    ui.horizontal(|ui| {
                        ui.label("类型:");
                        ui.selectable_value(&mut self.add_particle_type, ParticleType::A, "🟥 A");
                        ui.selectable_value(&mut self.add_particle_type, ParticleType::B, "🟩 B");
                        ui.selectable_value(&mut self.add_particle_type, ParticleType::C, "🟦 C");
                    });
                }

                ui.label(format!("笔刷大小: {:.1}", self.brush_size));
                ui.add(egui::Slider::new(&mut self.brush_size, 5.0..=100.0));

                ui.separator();

                let counts = self.simulation.get_population_counts();
                ui.heading("当前种群:");
                ui.label(format!("🟥 Type A: {}", counts[0]));
                ui.label(format!("🟩 Type B: {}", counts[1]));
                ui.label(format!("🟦 Type C: {}", counts[2]));
                ui.label(format!("总计: {}", self.simulation.particles.len()));

                ui.separator();

                ui.heading("配置管理:");
                ui.horizontal(|ui| {
                    if ui.button("💾 保存").clicked() {
                        self.save_config();
                    }
                    if ui.button("📂 加载").clicked() {
                        self.load_config();
                    }
                });

                if ui.button("⚙ 编辑规则").clicked() {
                    self.show_rules_window = true;
                }

                ui.separator();

                ui.heading("边界类型:");
                let old_boundary = self.config.simulation.boundary_type;
                ui.horizontal(|ui| {
                    ui.selectable_value(&mut self.config.simulation.boundary_type, 
                        BoundaryType::Wrap, "环绕 (Wrap)");
                    ui.selectable_value(&mut self.config.simulation.boundary_type, 
                        BoundaryType::Bounce, "反弹 (Bounce)");
                });
                
                if self.config.simulation.boundary_type != old_boundary {
                    self.simulation.config.boundary_type = self.config.simulation.boundary_type;
                    if self.network_client.is_connected() {
                        self.network_client.send(ClientMessage::UpdateConfig {
                            config: self.simulation.config.clone(),
                        });
                    }
                }

                ui.separator();

                ui.heading("物理参数:");
                let rules = &mut self.config.simulation.rules;
                
                ui.label("吸引半径:");
                ui.add(egui::Slider::new(&mut rules.attraction_radius, 20.0..=200.0));
                
                ui.label("排斥半径:");
                ui.add(egui::Slider::new(&mut rules.repulsion_radius, 5.0..=50.0));
                
                ui.label("摩擦系数:");
                ui.add(egui::Slider::new(&mut rules.friction, 0.8..=1.0));
                
                ui.label("最大速度:");
                ui.add(egui::Slider::new(&mut rules.max_speed, 1.0..=20.0));
                
                self.simulation.config.rules = rules.clone();
                if self.network_client.is_connected() {
                    self.network_client.send(ClientMessage::UpdateConfig {
                        config: self.simulation.config.clone(),
                    });
                }

                ui.separator();
                self.show_status_panel(ui);
            });
    }

    fn show_rules_window(&mut self, ctx: &egui::Context) {
        if !self.show_rules_window {
            return;
        }

        egui::Window::new("交互规则 (Interaction Rules)")
            .open(&mut self.show_rules_window)
            .default_size(egui::vec2(400.0, 400.0))
            .show(ctx, |ui| {
                ui.label("设置粒子类型间的吸引和排斥强度");
                ui.separator();

                let rules = &mut self.config.simulation.rules;
                let types = [ParticleType::A, ParticleType::B, ParticleType::C];
                let type_names = ["A", "B", "C"];

                ui.horizontal(|ui| {
                    ui.label("目标类型 →");
                    for name in &type_names {
                        ui.label(format!("  {}  ", name));
                    }
                });

                for (i, from_type) in types.iter().enumerate() {
                    ui.horizontal(|ui| {
                        ui.label(format!("{} ↓", type_names[i]));
                        for (j, _to_type) in types.iter().enumerate() {
                            ui.vertical(|ui| {
                                ui.label("吸引:");
                                ui.add(
                                    egui::DragValue::new(&mut rules.attraction_strength[i][j])
                                        .speed(0.01)
                                        .clamp_range(0.0..=2.0),
                                );
                                ui.label("排斥:");
                                ui.add(
                                    egui::DragValue::new(&mut rules.repulsion_strength[i][j])
                                        .speed(0.01)
                                        .clamp_range(0.0..=2.0),
                                );
                            });
                        }
                    });
                    ui.separator();
                }

                ui.label("说明:");
                ui.label("- 第一行第二列表示 A 对 B 的吸引/排斥强度");
                ui.label("- 正值表示吸引，负值表示排斥");

                if ui.button("恢复默认规则").clicked() {
                    self.config.simulation.rules = InteractionRules::default();
                }
                
                self.simulation.config.rules = rules.clone();
                if self.network_client.is_connected() {
                    self.network_client.send(ClientMessage::UpdateConfig {
                        config: self.simulation.config.clone(),
                    });
                }
            });
    }

    fn save_config(&mut self) {
        let path = self.last_config_path.clone().unwrap_or_else(|| {
            format!("config_{}.json", chrono::Local::now().format("%Y%m%d_%H%M%S"))
        });

        self.config.simulation.rules = self.simulation.config.rules.clone();
        
        let json = serde_json::to_string_pretty(&self.config)
            .expect("Failed to serialize config");

        fs::write(&path, json)
            .expect("Failed to save config");

        self.last_config_path = Some(path);
        self.add_status_message("配置已保存".to_string(), false);
    }

    fn load_config(&mut self) {
        let path = self.last_config_path.clone().unwrap_or_else(|| "config.json".to_string());
        
        if Path::new(&path).exists() {
            let json = fs::read_to_string(&path)
                .expect("Failed to read config");
            
            let config: AppConfig = serde_json::from_str(&json)
                .expect("Failed to parse config");

            self.config = config;
            self.simulation = Simulation::new(self.config.simulation.clone());
            self.last_config_path = Some(path);
            self.add_status_message("配置已加载".to_string(), false);
            
            if self.network_client.is_connected() {
                self.network_client.send(ClientMessage::UpdateConfig {
                    config: self.simulation.config.clone(),
                });
            }
        } else {
            self.add_status_message(format!("配置文件不存在: {}", path), true);
        }
    }
}

impl eframe::App for ParticleSimulationApp {
    fn update(&mut self, ctx: &egui::Context, _frame: &mut eframe::Frame) {
        self.process_network_messages();

        if !self.network_client.is_connected() || self.is_host_mode {
            self.simulation.update();
        }
        self.simulation.config.rules = self.config.simulation.rules.clone();

        self.show_control_panel(ctx);
        self.show_rules_window(ctx);
        self.show_chat_window(ctx);

        egui::CentralPanel::default().show(ctx, |ui| {
            ui.vertical(|ui| {
                ui.horizontal(|ui| {
                    ui.vertical(|ui| {
                        ui.label("粒子画布 (Particle Canvas)");
                        let canvas_response = self.draw_particles(ui);
                        self.handle_mouse_interaction(ui, &canvas_response);

                        let canvas_rect = canvas_response.rect;
                        if (self.simulation.config.width - canvas_rect.width()).abs() > 1.0 
                            || (self.simulation.config.height - canvas_rect.height()).abs() > 1.0 {
                            self.simulation.resize(canvas_rect.width(), canvas_rect.height());
                        }
                    });
                });

                ui.separator();

                ui.horizontal(|ui| {
                    ui.vertical(|ui| {
                        ui.add_space(10.0);
                        self.draw_population_chart(ui);
                    });
                    ui.vertical(|ui| {
                        ui.add_space(10.0);
                        self.draw_fps_chart(ui);
                    });
                });
            });
        });

        ctx.request_repaint();
    }
}
