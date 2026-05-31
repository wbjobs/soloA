use crate::types::*;
use crate::errors::*;
use crate::parser::{parse_packet, build_protocol_tree};
use pcap::{Capture, Device, Linktype};
use std::sync::{
    atomic::{AtomicBool, Ordering},
    mpsc::{self, Sender, Receiver},
    Arc,
};
use std::thread;
use std::collections::HashMap;
use chrono::Utc;
use uuid::Uuid;

pub struct CaptureManager {
    current_session: Option<CaptureSession>,
    is_running: Arc<AtomicBool>,
    packet_counter: u64,
    tcp_streams: HashMap<TcpStreamKey, TcpStream>,
}

#[derive(Debug, Clone)]
pub struct TcpStream {
    pub key: TcpStreamKey,
    pub client_data: Vec<u8>,
    pub server_data: Vec<u8>,
    pub client_segments: Vec<TcpSegmentData>,
    pub server_segments: Vec<TcpSegmentData>,
    pub client_expected_seq: Option<u32>,
    pub server_expected_seq: Option<u32>,
    pub client_initial_seq: Option<u32>,
    pub server_initial_seq: Option<u32>,
}

#[derive(Debug, Clone)]
pub struct TcpSegmentData {
    pub seq: u32,
    pub payload: Vec<u8>,
    pub seq_end: u32,
    pub consumed: bool,
}

impl TcpSegmentData {
    pub fn new(seq: u32, payload: Vec<u8>) -> Self {
        let len = payload.len() as u32;
        let seq_end = if len > 0 {
            seq.wrapping_add(len)
        } else {
            seq
        };
        Self {
            seq,
            payload,
            seq_end,
            consumed: false,
        }
    }

    pub fn length(&self) -> u32 {
        self.payload.len() as u32
    }

    pub fn contains_seq(&self, seq: u32) -> bool {
        if self.length() == 0 {
            return self.seq == seq;
        }
        let self_len = self.length();
        if self.seq <= self.seq_end {
            seq >= self.seq && seq < self.seq_end
        } else {
            seq >= self.seq || seq < self.seq_end
        }
    }

    pub fn overlaps_with(&self, other: &TcpSegmentData) -> bool {
        if self.length() == 0 || other.length() == 0 {
            return self.seq == other.seq;
        }
        self.contains_seq(other.seq) || other.contains_seq(self.seq)
    }

    pub fn is_duplicate_of(&self, other: &TcpSegmentData) -> bool {
        self.seq == other.seq && self.payload.len() == other.payload.len()
    }
}

pub enum CaptureCommand {
    Stop,
}

impl CaptureManager {
    pub fn new() -> Self {
        CaptureManager {
            current_session: None,
            is_running: Arc::new(AtomicBool::new(false)),
            packet_counter: 0,
            tcp_streams: HashMap::new(),
        }
    }

    pub fn list_interfaces() -> Vec<NetworkInterface> {
        let devices = match Device::list() {
            Ok(d) => d,
            Err(_) => return Vec::new(),
        };

        devices
            .into_iter()
            .map(|d| NetworkInterface {
                name: d.name.clone(),
                description: d.desc.clone().unwrap_or_else(|| d.name.clone()),
                addresses: d
                    .addresses
                    .iter()
                    .map(|a| InterfaceAddress {
                        ip: a.addr.to_string(),
                        netmask: a.netmask.map(|nm| nm.to_string()),
                        broadcast: a.broadcast.map(|b| b.to_string()),
                    })
                    .collect(),
                is_up: d.flags.is_up(),
                is_running: d.flags.is_running(),
            })
            .collect()
    }

    pub fn start_capture(
        &mut self,
        interface_name: &str,
        promiscuous: bool,
        bpf_filter: Option<&str>,
    ) -> Result<(CaptureSession, Receiver<PacketInfo>)> {
        if self.is_running.load(Ordering::SeqCst) {
            return Err(AnalyzerError::CaptureInProgress);
        }

        let device = Device::from(interface_name);

        let mut cap = Capture::from_device(device)
            .map_err(|e| AnalyzerError::InvalidInterface(format!("{}: {}", interface_name, e)))?
            .promisc(promiscuous)
            .snaplen(65535)
            .timeout(500)
            .open()?;

        cap.set_datalink(Linktype::ETHERNET)?;

        if let Some(filter) = bpf_filter {
            if !filter.trim().is_empty() {
                cap.filter(filter, true)?;
            }
        }

        let session = CaptureSession {
            id: Uuid::new_v4().to_string(),
            name: format!(
                "Capture-{}",
                Utc::now().format("%Y%m%d-%H%M%S")
            ),
            interface_name: interface_name.to_string(),
            start_time: Utc::now().timestamp_millis(),
            end_time: None,
            packet_count: 0,
            promiscuous,
            bpf_filter: bpf_filter.map(|s| s.to_string()),
        };

        self.current_session = Some(session.clone());
        self.is_running.store(true, Ordering::SeqCst);
        self.packet_counter = 0;
        self.tcp_streams.clear();

        let (tx, rx) = mpsc::channel::<PacketInfo>();
        let is_running = self.is_running.clone();

        thread::spawn(move || {
            Self::capture_loop(cap, tx, is_running);
        });

        Ok((session, rx))
    }

    fn capture_loop(
        mut cap: Capture<pcap::Active>,
        tx: Sender<PacketInfo>,
        is_running: Arc<AtomicBool>,
    ) {
        let mut packet_number: u64 = 1;

        while is_running.load(Ordering::SeqCst) {
            match cap.next_packet() {
                Ok(packet) => {
                    let raw_bytes = packet.data.to_vec();
                    let timestamp = packet.header.ts.tv_sec as i64;

                    let packet_info = match Self::process_packet(&raw_bytes, packet_number, timestamp) {
                        Ok(p) => p,
                        Err(_) => {
                            let dt = chrono::DateTime::<chrono::Utc>::from_timestamp(timestamp, 0)
                                .unwrap_or_else(|| chrono::Utc::now());
                            
                            PacketInfo {
                                number: packet_number,
                                timestamp,
                                timestamp_str: dt.format("%H:%M:%S%.6f").to_string(),
                                src_address: "unknown".to_string(),
                                dst_address: "unknown".to_string(),
                                src_port: None,
                                dst_port: None,
                                protocol: "Unknown".to_string(),
                                length: raw_bytes.len() as u32,
                                info: "Unparsed packet".to_string(),
                                raw_bytes: raw_bytes.clone(),
                                tree: ProtocolTreeNode {
                                    name: "frame".to_string(),
                                    description: format!("Frame ({} bytes)", raw_bytes.len()),
                                    raw_value: Some(raw_bytes),
                                    fields: None,
                                    children: None,
                                },
                            }
                        }
                    };

                    if tx.send(packet_info).is_err() {
                        break;
                    }
                    packet_number += 1;
                }
                Err(pcap::Error::TimeoutExpired) => continue,
                Err(_e) => {
                    if is_running.load(Ordering::SeqCst) {
                        continue;
                    }
                    break;
                }
            }
        }
    }

    fn process_packet(data: &[u8], packet_number: u64, timestamp: i64) -> Result<PacketInfo> {
        let parsed = parse_packet(data)?;
        let tree = build_protocol_tree(&parsed, data);

        let dt = chrono::DateTime::<chrono::Utc>::from_timestamp(timestamp, 0)
            .unwrap_or_else(|| chrono::Utc::now());

        Ok(PacketInfo {
            number: packet_number,
            timestamp,
            timestamp_str: dt.format("%H:%M:%S%.6f").to_string(),
            src_address: parsed.src_addr,
            dst_address: parsed.dst_addr,
            src_port: parsed.src_port,
            dst_port: parsed.dst_port,
            protocol: parsed.top_protocol,
            length: data.len() as u32,
            info: parsed.info,
            raw_bytes: data.to_vec(),
            tree,
        })
    }

    pub fn process_tcp_segment(
        &mut self,
        src_ip: std::net::IpAddr,
        dst_ip: std::net::IpAddr,
        src_port: u16,
        dst_port: u16,
        seq: u32,
        payload: &[u8],
        syn: bool,
    ) {
        let key = TcpStreamKey::new(src_ip, dst_ip, src_port, dst_port);
        let canonical = key.canonical();
        let is_client = (src_ip, src_port) < (dst_ip, dst_port);

        let stream = self.tcp_streams.entry(canonical).or_insert_with(|| TcpStream {
            key: canonical,
            client_data: Vec::new(),
            server_data: Vec::new(),
            client_segments: Vec::new(),
            server_segments: Vec::new(),
            client_expected_seq: None,
            server_expected_seq: None,
            client_initial_seq: None,
            server_initial_seq: None,
        });

        let incoming = TcpSegmentData::new(seq, payload.to_vec());

        let (segments, expected_seq, initial_seq) = if is_client {
            (&mut stream.client_segments, &mut stream.client_expected_seq, &mut stream.client_initial_seq)
        } else {
            (&mut stream.server_segments, &mut stream.expected_seq, &mut stream.server_initial_seq)
        };

        if syn {
            if initial_seq.is_none() {
                *initial_seq = Some(seq);
                *expected_seq = Some(seq.wrapping_add(1));
            }
            if payload.is_empty() {
                return;
            }
        }

        if let Some(expected) = *expected_seq {
            if self.is_segment_duplicate(&incoming, segments) {
                eprintln!("[DEBUG] Duplicate segment detected at Seq={}, skipping", seq);
                return;
            }
        }

        if !self.is_segment_already_stored(seq, payload.len() as u32, segments) {
            segments.push(incoming.clone());
            segments.sort_by(|a, b| a.seq.cmp(&b.seq));
        }

        self.try_consume_segments(stream, is_client);
    }

    fn is_segment_duplicate(
        &self,
        incoming: &TcpSegmentData,
        existing: &[TcpSegmentData],
    ) -> bool {
        for seg in existing {
            if seg.is_duplicate_of(incoming) {
                return true;
            }
            if incoming.length() > 0 && seg.contains_seq(incoming.seq) {
                if let Some(overlap_len) = self.get_overlap_length(seg, incoming) {
                    if overlap_len == incoming.length() {
                        return true;
                    }
                }
            }
        }
        false
    }

    fn is_segment_already_stored(
        &self,
        seq: u32,
        length: u32,
        segments: &[TcpSegmentData],
    ) -> bool {
        for seg in segments {
            if seg.seq == seq && seg.length() == length {
                return true;
            }
        }
        false
    }

    fn get_overlap_length(
        &self,
        a: &TcpSegmentData,
        b: &TcpSegmentData,
    ) -> Option<u32> {
        if a.length() == 0 || b.length() == 0 {
            return None;
        }

        let a_start = a.seq;
        let a_end = a.seq_end;
        let b_start = b.seq;
        let b_end = b.seq_end;

        let normal = a_start <= a_end && b_start <= b_end;
        if normal {
            let overlap_start = a_start.max(b_start);
            let overlap_end = a_end.min(b_end);
            if overlap_start < overlap_end {
                return Some(overlap_end - overlap_start);
            }
        }

        None
    }

    fn try_consume_segments(
        &self,
        stream: &mut TcpStream,
        is_client: bool,
    ) {
        let (segments, expected_seq, data) = if is_client {
            (
                &mut stream.client_segments,
                &mut stream.client_expected_seq,
                &mut stream.client_data,
            )
        } else {
            (
                &mut stream.server_segments,
                &mut stream.server_expected_seq,
                &mut stream.server_data,
            )
        };

        loop {
            let mut consumed_any = false;

            for i in 0..segments.len() {
                if segments[i].consumed || segments[i].length() == 0 {
                    continue;
                }

                let seg_seq = segments[i].seq;
                let seg_seq_end = segments[i].seq_end;
                let seg_len = segments[i].length();

                match *expected_seq {
                    None => {
                        *expected_seq = Some(seg_seq);
                        continue;
                    }
                    Some(expected) => {
                        if seg_seq == expected {
                            let payload = segments[i].payload.clone();
                            
                            segments[i].consumed = true;
                            data.extend_from_slice(&payload);
                            *expected_seq = Some(seg_seq_end);
                            consumed_any = true;
                        } else if self.seq_less_than(expected, seg_seq) {
                            eprintln!("[DEBUG] Out-of-order segment detected: Expected Seq={}, got Seq={} ({} bytes in future)", 
                                expected, seg_seq, 
                                seg_seq.wrapping_sub(expected));
                        } else if self.seq_less_than(seg_seq, expected) {
                            if seg_seq_end == expected {
                                segments[i].consumed = true;
                                consumed_any = true;
                            } else if self.seq_less_than(expected, seg_seq_end) {
                                let overlap_start = expected;
                                let overlap_end = seg_seq_end;
                                let overlap_bytes = overlap_end.wrapping_sub(overlap_start) as usize;
                                let skip_bytes = expected.wrapping_sub(seg_seq) as usize;
                                
                                eprintln!("[DEBUG] Partial retransmission recovery: Seq={} overlaps with consumed data ({} bytes overlap, skipping {} bytes)", 
                                    seg_seq, overlap_bytes, skip_bytes);
                                
                                if skip_bytes < segments[i].payload.len() {
                                    let partial_payload = segments[i].payload[skip_bytes..].to_vec();
                                    segments[i].consumed = true;
                                    data.extend_from_slice(&partial_payload);
                                    *expected_seq = Some(seg_seq_end);
                                    consumed_any = true;
                                } else {
                                    segments[i].consumed = true;
                                    consumed_any = true;
                                }
                            } else {
                                let overlap = self.calculate_received_overlap(&segments[i], expected);
                                if overlap > 0 {
                                    eprintln!("[DEBUG] Retransmission ignored: Seq={} entirely before expected={} ({} bytes overlap)", 
                                        seg_seq, expected, overlap);
                                }
                                segments[i].consumed = true;
                                consumed_any = true;
                            }
                        }
                    }
                }
            }

            if !consumed_any {
                break;
            }
        }
    }

    fn seq_less_than(&self, a: u32, b: u32) -> bool {
        const WINDOW: u32 = 0x7FFFFFFF;
        a.wrapping_sub(b) > WINDOW
    }

    fn calculate_received_overlap(
        &self,
        seg: &TcpSegmentData,
        expected: u32,
    ) -> u32 {
        if seg.length() == 0 {
            return 0;
        }

        let seg_start = seg.seq;
        let seg_end = seg.seq_end;

        if self.seq_less_than(seg_start, expected) && self.seq_less_than(seg_start, seg_end) {
            if self.seq_less_than(expected, seg_end) {
                return expected.wrapping_sub(seg_start);
            } else {
                return seg.length();
            }
        }

        0
    }

    pub fn stop_capture(&mut self) -> Result<CaptureSession> {
        self.is_running.store(false, Ordering::SeqCst);

        if let Some(mut session) = self.current_session.take() {
            session.end_time = Some(Utc::now().timestamp_millis());
            Ok(session)
        } else {
            Err(AnalyzerError::NoCaptureInProgress)
        }
    }

    pub fn is_running(&self) -> bool {
        self.is_running.load(Ordering::SeqCst)
    }

    pub fn current_session(&self) -> Option<&CaptureSession> {
        self.current_session.as_ref()
    }

    pub fn get_tcp_streams(&self) -> Vec<TcpStreamData> {
        self.tcp_streams
            .iter()
            .map(|(key, stream)| TcpStreamData {
                stream_id: key.to_string(),
                client_address: stream.key.src_ip.to_string(),
                client_port: stream.key.src_port,
                server_address: stream.key.dst_ip.to_string(),
                server_port: stream.key.dst_port,
                client_data: String::from_utf8_lossy(&stream.client_data).to_string(),
                server_data: String::from_utf8_lossy(&stream.server_data).to_string(),
            })
            .collect()
    }

    pub fn get_tcp_stream(&self, stream_id: &str) -> Option<TcpStreamData> {
        self.tcp_streams
            .iter()
            .find(|(key, _)| key.to_string() == stream_id)
            .map(|(_, stream)| TcpStreamData {
                stream_id: stream_id.to_string(),
                client_address: stream.key.src_ip.to_string(),
                client_port: stream.key.src_port,
                server_address: stream.key.dst_ip.to_string(),
                server_port: stream.key.dst_port,
                client_data: String::from_utf8_lossy(&stream.client_data).to_string(),
                server_data: String::from_utf8_lossy(&stream.server_data).to_string(),
            })
    }

    pub fn compile_bpf_filter(filter: &str) -> Result<()> {
        if filter.trim().is_empty() {
            return Ok(());
        }

        let devices = Device::list()?;
        if devices.is_empty() {
            return Ok(());
        }

        let device = devices.into_iter().next().unwrap();
        let cap = Capture::from_device(device)
            .snaplen(65535)
            .timeout(100)
            .open()?;

        match cap.compile(filter, true) {
            Ok(_) => Ok(()),
            Err(e) => Err(AnalyzerError::BpfFilter(e.to_string())),
        }
    }
}

impl Default for CaptureManager {
    fn default() -> Self {
        Self::new()
    }
}
