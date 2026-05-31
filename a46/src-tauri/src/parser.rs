use crate::types::*;
use crate::errors::*;
use std::net::{Ipv4Addr, Ipv6Addr};

pub fn parse_packet(data: &[u8]) -> Result<ParsedPacket> {
    let eth_frame = parse_ethernet(data)?;
    
    let mut parsed = ParsedPacket {
        eth_frame: None,
        ipv4_packet: None,
        ipv6_packet: None,
        tcp_segment: None,
        udp_datagram: None,
        arp_packet: None,
        icmp_packet: None,
        http_message: None,
        dns_message: None,
        info: String::new(),
        top_protocol: "ETH".to_string(),
        src_addr: String::new(),
        dst_addr: String::new(),
        src_port: None,
        dst_port: None,
    };

    parsed.src_addr = format_mac(&eth_frame.src_mac);
    parsed.dst_addr = format_mac(&eth_frame.dst_mac);
    parsed.eth_frame = Some(eth_frame.clone());

    match eth_frame.ether_type {
        ETHERTYPE_ARP => {
            let arp = parse_arp(&eth_frame.payload)?;
            parsed.info = arp_info(&arp);
            parsed.top_protocol = "ARP".to_string();
            parsed.src_addr = arp.sender_ip.to_string();
            parsed.dst_addr = arp.target_ip.to_string();
            parsed.arp_packet = Some(arp);
        }
        ETHERTYPE_IP => {
            let ipv4 = parse_ipv4(&eth_frame.payload)?;
            parsed.src_addr = ipv4.src_ip.to_string();
            parsed.dst_addr = ipv4.dst_ip.to_string();
            parsed.ipv4_packet = Some(ipv4.clone());
            parsed.top_protocol = "IP".to_string();

            match ipv4.protocol {
                IPPROTO_TCP => {
                    let tcp = parse_tcp(&ipv4.payload)?;
                    parsed.src_port = Some(tcp.src_port);
                    parsed.dst_port = Some(tcp.dst_port);
                    parsed.tcp_segment = Some(tcp.clone());
                    parsed.top_protocol = "TCP".to_string();
                    parsed.info = tcp_info(&tcp);

                    if is_http_port(tcp.src_port) || is_http_port(tcp.dst_port) {
                        if let Ok(http) = parse_http(&tcp.payload) {
                            parsed.http_message = Some(http.clone());
                            parsed.top_protocol = "HTTP".to_string();
                            parsed.info = http_info(&http);
                        }
                    }
                }
                IPPROTO_UDP => {
                    let udp = parse_udp(&ipv4.payload)?;
                    parsed.src_port = Some(udp.src_port);
                    parsed.dst_port = Some(udp.dst_port);
                    parsed.udp_datagram = Some(udp.clone());
                    parsed.top_protocol = "UDP".to_string();
                    parsed.info = udp_info(&udp);

                    if udp.src_port == DNS_PORT || udp.dst_port == DNS_PORT {
                        if let Ok(dns) = parse_dns(&udp.payload) {
                            parsed.dns_message = Some(dns.clone());
                            parsed.top_protocol = "DNS".to_string();
                            parsed.info = dns_info(&dns);
                        }
                    }
                }
                IPPROTO_ICMP => {
                    let icmp = parse_icmp(&ipv4.payload)?;
                    parsed.icmp_packet = Some(icmp.clone());
                    parsed.top_protocol = "ICMP".to_string();
                    parsed.info = icmp_info(&icmp);
                }
                proto => {
                    parsed.info = format!("Unknown IP protocol: {}", proto);
                }
            }
        }
        ETHERTYPE_IPV6 => {
            let ipv6 = parse_ipv6(&eth_frame.payload)?;
            parsed.src_addr = ipv6.src_ip.to_string();
            parsed.dst_addr = ipv6.dst_ip.to_string();
            parsed.ipv6_packet = Some(ipv6.clone());
            parsed.top_protocol = "IPv6".to_string();
            parsed.info = "IPv6 packet".to_string();

            match ipv6.next_header {
                IPPROTO_TCP => {
                    if let Ok(tcp) = parse_tcp(&ipv6.payload) {
                        parsed.src_port = Some(tcp.src_port);
                        parsed.dst_port = Some(tcp.dst_port);
                        parsed.tcp_segment = Some(tcp.clone());
                        parsed.top_protocol = "TCP".to_string();
                        parsed.info = tcp_info(&tcp);
                    }
                }
                IPPROTO_UDP => {
                    if let Ok(udp) = parse_udp(&ipv6.payload) {
                        parsed.src_port = Some(udp.src_port);
                        parsed.dst_port = Some(udp.dst_port);
                        parsed.udp_datagram = Some(udp.clone());
                        parsed.top_protocol = "UDP".to_string();
                        parsed.info = udp_info(&udp);
                    }
                }
                _ => {}
            }
        }
        etype => {
            parsed.info = format!("Unknown EtherType: 0x{:04x}", etype);
        }
    }

    Ok(parsed)
}

pub fn parse_ethernet(data: &[u8]) -> Result<EthernetFrame> {
    if data.len() < 14 {
        return Err(AnalyzerError::Parse("Ethernet frame too short".into()));
    }

    let mut dst_mac = [0u8; 6];
    let mut src_mac = [0u8; 6];
    dst_mac.copy_from_slice(&data[0..6]);
    src_mac.copy_from_slice(&data[6..12]);

    let ether_type = u16::from_be_bytes([data[12], data[13]]);
    let payload = data[14..].to_vec();

    Ok(EthernetFrame {
        dst_mac,
        src_mac,
        ether_type,
        payload,
        raw_bytes: data.to_vec(),
    })
}

pub fn parse_arp(data: &[u8]) -> Result<ArpPacket> {
    if data.len() < 28 {
        return Err(AnalyzerError::Parse("ARP packet too short".into()));
    }

    let hardware_type = u16::from_be_bytes([data[0], data[1]]);
    let protocol_type = u16::from_be_bytes([data[2], data[3]]);
    let hw_addr_len = data[4];
    let proto_addr_len = data[5];
    let operation = u16::from_be_bytes([data[6], data[7]]);

    let mut sender_mac = [0u8; 6];
    sender_mac.copy_from_slice(&data[8..14]);
    let sender_ip = Ipv4Addr::new(data[14], data[15], data[16], data[17]);

    let mut target_mac = [0u8; 6];
    target_mac.copy_from_slice(&data[18..24]);
    let target_ip = Ipv4Addr::new(data[24], data[25], data[26], data[27]);

    Ok(ArpPacket {
        hardware_type,
        protocol_type,
        hw_addr_len,
        proto_addr_len,
        operation,
        sender_mac,
        sender_ip,
        target_mac,
        target_ip,
        raw_bytes: data.to_vec(),
    })
}

pub fn parse_ipv4(data: &[u8]) -> Result<Ipv4Packet> {
    if data.len() < 20 {
        return Err(AnalyzerError::Parse("IPv4 packet too short".into()));
    }

    let version_ihl = data[0];
    let version = version_ihl >> 4;
    let ihl = (version_ihl & 0x0F) * 4;

    if data.len() < ihl as usize {
        return Err(AnalyzerError::Parse("IPv4 IHL exceeds packet length".into()));
    }

    let tos = data[1];
    let total_length = u16::from_be_bytes([data[2], data[3]]);
    let identification = u16::from_be_bytes([data[4], data[5]]);
    let flags_frag = u16::from_be_bytes([data[6], data[7]]);
    let flags = (flags_frag >> 13) as u8;
    let frag_offset = flags_frag & 0x1FFF;
    let ttl = data[8];
    let protocol = data[9];
    let checksum = u16::from_be_bytes([data[10], data[11]]);
    let src_ip = Ipv4Addr::new(data[12], data[13], data[14], data[15]);
    let dst_ip = Ipv4Addr::new(data[16], data[17], data[18], data[19]);

    let options = if ihl > 20 {
        data[20..ihl as usize].to_vec()
    } else {
        Vec::new()
    };

    let payload = data[ihl as usize..].to_vec();

    Ok(Ipv4Packet {
        version,
        ihl,
        tos,
        total_length,
        identification,
        flags,
        frag_offset,
        ttl,
        protocol,
        checksum,
        src_ip,
        dst_ip,
        options,
        payload,
        raw_bytes: data.to_vec(),
    })
}

pub fn parse_ipv6(data: &[u8]) -> Result<Ipv6Packet> {
    if data.len() < 40 {
        return Err(AnalyzerError::Parse("IPv6 packet too short".into()));
    }

    let version_tc_fl = u32::from_be_bytes([data[0], data[1], data[2], data[3]]);
    let version = ((version_tc_fl >> 28) & 0x0F) as u8;
    let traffic_class = ((version_tc_fl >> 20) & 0xFF) as u8;
    let flow_label = version_tc_fl & 0x000FFFFF;

    let payload_length = u16::from_be_bytes([data[4], data[5]]);
    let next_header = data[6];
    let hop_limit = data[7];

    let src_ip = Ipv6Addr::from([
        data[8], data[9], data[10], data[11],
        data[12], data[13], data[14], data[15],
        data[16], data[17], data[18], data[19],
        data[20], data[21], data[22], data[23],
    ]);
    let dst_ip = Ipv6Addr::from([
        data[24], data[25], data[26], data[27],
        data[28], data[29], data[30], data[31],
        data[32], data[33], data[34], data[35],
        data[36], data[37], data[38], data[39],
    ]);

    let payload = data[40..].to_vec();

    Ok(Ipv6Packet {
        version,
        traffic_class,
        flow_label,
        payload_length,
        next_header,
        hop_limit,
        src_ip,
        dst_ip,
        payload,
        raw_bytes: data.to_vec(),
    })
}

pub fn parse_tcp(data: &[u8]) -> Result<TcpSegment> {
    if data.len() < 20 {
        return Err(AnalyzerError::Parse("TCP segment too short".into()));
    }

    let src_port = u16::from_be_bytes([data[0], data[1]]);
    let dst_port = u16::from_be_bytes([data[2], data[3]]);
    let seq_number = u32::from_be_bytes([data[4], data[5], data[6], data[7]]);
    let ack_number = u32::from_be_bytes([data[8], data[9], data[10], data[11]]);
    let data_offset_reserved = data[12];
    let data_offset = (data_offset_reserved >> 4) * 4;
    let flags = TcpFlags::from_u8(data[13]);
    let window_size = u16::from_be_bytes([data[14], data[15]]);
    let checksum = u16::from_be_bytes([data[16], data[17]]);
    let urgent_ptr = u16::from_be_bytes([data[18], data[19]]);

    let options = if data_offset > 20 && data.len() >= data_offset as usize {
        data[20..data_offset as usize].to_vec()
    } else {
        Vec::new()
    };

    let payload = if data.len() > data_offset as usize {
        data[data_offset as usize..].to_vec()
    } else {
        Vec::new()
    };

    Ok(TcpSegment {
        src_port,
        dst_port,
        seq_number,
        ack_number,
        data_offset,
        flags,
        window_size,
        checksum,
        urgent_ptr,
        options,
        payload,
        raw_bytes: data.to_vec(),
    })
}

pub fn parse_udp(data: &[u8]) -> Result<UdpDatagram> {
    if data.len() < 8 {
        return Err(AnalyzerError::Parse("UDP datagram too short".into()));
    }

    let src_port = u16::from_be_bytes([data[0], data[1]]);
    let dst_port = u16::from_be_bytes([data[2], data[3]]);
    let length = u16::from_be_bytes([data[4], data[5]]);
    let checksum = u16::from_be_bytes([data[6], data[7]]);
    let payload = data[8..].to_vec();

    Ok(UdpDatagram {
        src_port,
        dst_port,
        length,
        checksum,
        payload,
        raw_bytes: data.to_vec(),
    })
}

pub fn parse_icmp(data: &[u8]) -> Result<IcmpPacket> {
    if data.len() < 4 {
        return Err(AnalyzerError::Parse("ICMP packet too short".into()));
    }

    let message_type = data[0];
    let code = data[1];
    let checksum = u16::from_be_bytes([data[2], data[3]]);
    let data = data[4..].to_vec();

    Ok(IcmpPacket {
        message_type,
        code,
        checksum,
        data,
        raw_bytes: [&[message_type, code], &checksum.to_be_bytes(), &data[..]].concat(),
    })
}

pub fn parse_http(data: &[u8]) -> Result<HttpMessage> {
    if data.is_empty() {
        return Err(AnalyzerError::Parse("Empty HTTP data".into()));
    }

    let text = String::from_utf8_lossy(data);
    let lines: Vec<&str> = text.split("\r\n").collect();

    if lines.is_empty() {
        return Err(AnalyzerError::Parse("No HTTP lines".into()));
    }

    let first_line = lines[0];
    let is_request = first_line.starts_with("GET ")
        || first_line.starts_with("POST ")
        || first_line.starts_with("PUT ")
        || first_line.starts_with("DELETE ")
        || first_line.starts_with("HEAD ")
        || first_line.starts_with("OPTIONS ")
        || first_line.starts_with("PATCH ");

    let is_response = first_line.starts_with("HTTP/");

    if !is_request && !is_response {
        return Err(AnalyzerError::Parse("Not an HTTP message".into()));
    }

    let mut method = None;
    let mut uri = None;
    let mut version = String::new();
    let mut status_code = None;
    let mut status_text = None;
    let mut headers = Vec::new();

    if is_request {
        let parts: Vec<&str> = first_line.split_whitespace().collect();
        if parts.len() >= 3 {
            method = Some(parts[0].to_string());
            uri = Some(parts[1].to_string());
            version = parts[2].to_string();
        }
    } else {
        let parts: Vec<&str> = first_line.splitn(3, ' ').collect();
        if parts.len() >= 2 {
            version = parts[0].to_string();
            status_code = parts[1].parse().ok();
            if parts.len() >= 3 {
                status_text = Some(parts[2].to_string());
            }
        }
    }

    let mut header_start = 1;
    while header_start < lines.len() {
        let line = lines[header_start];
        if line.is_empty() {
            break;
        }
        if let Some(idx) = line.find(':') {
            let name = line[..idx].trim().to_string();
            let value = line[idx + 1..].trim().to_string();
            headers.push((name, value));
        }
        header_start += 1;
    }

    let body_start = first_line.len() + 2;
    let mut pos = body_start;
    for &line in &lines[1..=header_start] {
        pos += line.len() + 2;
    }

    let body = if pos < data.len() {
        data[pos..].to_vec()
    } else {
        Vec::new()
    };

    Ok(HttpMessage {
        is_request,
        method,
        uri,
        version,
        status_code,
        status_text,
        headers,
        body,
        raw_bytes: data.to_vec(),
    })
}

pub fn parse_dns(data: &[u8]) -> Result<DnsMessage> {
    if data.len() < 12 {
        return Err(AnalyzerError::Parse("DNS message too short".into()));
    }

    let id = u16::from_be_bytes([data[0], data[1]]);
    let flags = u16::from_be_bytes([data[2], data[3]]);
    let qr = (flags & 0x8000) != 0;
    let opcode = ((flags >> 11) & 0x0F) as u8;
    let aa = (flags & 0x0400) != 0;
    let tc = (flags & 0x0200) != 0;
    let rd = (flags & 0x0100) != 0;
    let ra = (flags & 0x0080) != 0;
    let rcode = (flags & 0x000F) as u8;

    let qdcount = u16::from_be_bytes([data[4], data[5]]);
    let ancount = u16::from_be_bytes([data[6], data[7]]);
    let nscount = u16::from_be_bytes([data[8], data[9]]);
    let arcount = u16::from_be_bytes([data[10], data[11]]);

    let mut offset = 12;

    let mut questions = Vec::new();
    for _ in 0..qdcount {
        let (qname, consumed) = parse_dns_name(data, offset)?;
        offset += consumed;
        if offset + 4 > data.len() {
            break;
        }
        let qtype = u16::from_be_bytes([data[offset], data[offset + 1]]);
        let qclass = u16::from_be_bytes([data[offset + 2], data[offset + 3]]);
        offset += 4;
        questions.push(DnsQuestion { name: qname, qtype, qclass });
    }

    let mut answers = Vec::new();
    for _ in 0..ancount {
        let (name, consumed) = parse_dns_name(data, offset)?;
        offset += consumed;
        if offset + 10 > data.len() {
            break;
        }
        let rtype = u16::from_be_bytes([data[offset], data[offset + 1]]);
        let rclass = u16::from_be_bytes([data[offset + 2], data[offset + 3]]);
        let ttl = u32::from_be_bytes([data[offset + 4], data[offset + 5], data[offset + 6], data[offset + 7]]);
        let rdlength = u16::from_be_bytes([data[offset + 8], data[offset + 9]]);
        offset += 10;
        if offset + rdlength as usize > data.len() {
            break;
        }
        let rdata = data[offset..offset + rdlength as usize].to_vec();
        offset += rdlength as usize;
        answers.push(DnsResourceRecord { name, rtype, rclass, ttl, rdata });
    }

    let mut authorities = Vec::new();
    for _ in 0..nscount {
        if offset + 12 > data.len() {
            break;
        }
        let (name, consumed) = parse_dns_name(data, offset)?;
        offset += consumed;
        let rtype = u16::from_be_bytes([data[offset], data[offset + 1]]);
        let rclass = u16::from_be_bytes([data[offset + 2], data[offset + 3]]);
        let ttl = u32::from_be_bytes([data[offset + 4], data[offset + 5], data[offset + 6], data[offset + 7]]);
        let rdlength = u16::from_be_bytes([data[offset + 8], data[offset + 9]]);
        offset += 10;
        if offset + rdlength as usize > data.len() {
            break;
        }
        let rdata = data[offset..offset + rdlength as usize].to_vec();
        offset += rdlength as usize;
        authorities.push(DnsResourceRecord { name, rtype, rclass, ttl, rdata });
    }

    let mut additionals = Vec::new();
    for _ in 0..arcount {
        if offset + 12 > data.len() {
            break;
        }
        let (name, consumed) = parse_dns_name(data, offset)?;
        offset += consumed;
        let rtype = u16::from_be_bytes([data[offset], data[offset + 1]]);
        let rclass = u16::from_be_bytes([data[offset + 2], data[offset + 3]]);
        let ttl = u32::from_be_bytes([data[offset + 4], data[offset + 5], data[offset + 6], data[offset + 7]]);
        let rdlength = u16::from_be_bytes([data[offset + 8], data[offset + 9]]);
        offset += 10;
        if offset + rdlength as usize > data.len() {
            break;
        }
        let rdata = data[offset..offset + rdlength as usize].to_vec();
        offset += rdlength as usize;
        additionals.push(DnsResourceRecord { name, rtype, rclass, ttl, rdata });
    }

    Ok(DnsMessage {
        id,
        flags,
        qr,
        opcode,
        aa,
        tc,
        rd,
        ra,
        rcode,
        questions,
        answers,
        authorities,
        additionals,
        raw_bytes: data.to_vec(),
    })
}

fn parse_dns_name(data: &[u8], mut offset: usize) -> Result<(String, usize)> {
    let mut name_parts = Vec::new();
    let mut start_offset = offset;
    let mut jumped = false;

    loop {
        if offset >= data.len() {
            break;
        }
        let len = data[offset];

        if len == 0 {
            offset += 1;
            break;
        }

        if (len & 0xC0) == 0xC0 {
            if offset + 1 >= data.len() {
                return Err(AnalyzerError::Parse("Invalid DNS name pointer".into()));
            }
            let ptr = ((len as usize & 0x3F) << 8) | data[offset + 1] as usize;
            if !jumped {
                offset += 2;
            }
            jumped = true;
            let (subname, _) = parse_dns_name(data, ptr)?;
            name_parts.push(subname);
            break;
        } else {
            offset += 1;
            if offset + len as usize > data.len() {
                return Err(AnalyzerError::Parse("DNS name length exceeds packet".into()));
            }
            let label = std::str::from_utf8(&data[offset..offset + len as usize])
                .unwrap_or("?")
                .to_string();
            name_parts.push(label);
            offset += len as usize;
        }
    }

    Ok((name_parts.join("."), offset - start_offset))
}

pub fn build_protocol_tree(parsed: &ParsedPacket, raw_bytes: &[u8]) -> ProtocolTreeNode {
    let mut children = Vec::new();

    if let Some(eth) = &parsed.eth_frame {
        children.push(build_eth_node(eth));
    }
    if let Some(arp) = &parsed.arp_packet {
        children.push(build_arp_node(arp));
    }
    if let Some(ipv4) = &parsed.ipv4_packet {
        children.push(build_ipv4_node(ipv4));
    }
    if let Some(ipv6) = &parsed.ipv6_packet {
        children.push(build_ipv6_node(ipv6));
    }
    if let Some(tcp) = &parsed.tcp_segment {
        children.push(build_tcp_node(tcp));
    }
    if let Some(udp) = &parsed.udp_datagram {
        children.push(build_udp_node(udp));
    }
    if let Some(icmp) = &parsed.icmp_packet {
        children.push(build_icmp_node(icmp));
    }
    if let Some(http) = &parsed.http_message {
        children.push(build_http_node(http));
    }
    if let Some(dns) = &parsed.dns_message {
        children.push(build_dns_node(dns));
    }

    ProtocolTreeNode {
        name: "frame".to_string(),
        description: format!("Frame ({} bytes)", raw_bytes.len()),
        raw_value: Some(raw_bytes.to_vec()),
        fields: Some(vec![
            ProtocolField {
                name: "Encapsulation type".to_string(),
                value: "Ethernet (1)".to_string(),
                raw_value: None,
                description: None,
            },
            ProtocolField {
                name: "Arrival Time".to_string(),
                value: chrono::Local::now().to_rfc3339(),
                raw_value: None,
                description: None,
            },
            ProtocolField {
                name: "Length".to_string(),
                value: format!("{} bytes", raw_bytes.len()),
                raw_value: None,
                description: None,
            },
        ]),
        children: if children.is_empty() { None } else { Some(children) },
    }
}

fn build_eth_node(eth: &EthernetFrame) -> ProtocolTreeNode {
    ProtocolTreeNode {
        name: "eth".to_string(),
        description: format!("Ethernet II, Src: {}, Dst: {}",
            format_mac(&eth.src_mac), format_mac(&eth.dst_mac)),
        fields: Some(vec![
            ProtocolField {
                name: "Destination".to_string(),
                value: format_mac(&eth.dst_mac),
                raw_value: Some(format_bytes_hex(&eth.dst_mac)),
                description: None,
            },
            ProtocolField {
                name: "Source".to_string(),
                value: format_mac(&eth.src_mac),
                raw_value: Some(format_bytes_hex(&eth.src_mac)),
                description: None,
            },
            ProtocolField {
                name: "Type".to_string(),
                value: ether_type_name(eth.ether_type),
                raw_value: Some(format!("0x{:04x}", eth.ether_type)),
                description: None,
            },
        ]),
        children: None,
        raw_value: Some(eth.raw_bytes.clone()),
    }
}

fn build_arp_node(arp: &ArpPacket) -> ProtocolTreeNode {
    let op_name = match arp.operation {
        1 => "Request",
        2 => "Reply",
        _ => "Unknown",
    };
    ProtocolTreeNode {
        name: "arp".to_string(),
        description: format!("Address Resolution Protocol ({})", op_name),
        fields: Some(vec![
            ProtocolField { name: "Hardware type".to_string(), value: "Ethernet (1)".to_string(), raw_value: Some(format!("0x{:04x}", arp.hardware_type)), description: None },
            ProtocolField { name: "Protocol type".to_string(), value: "IPv4".to_string(), raw_value: Some(format!("0x{:04x}", arp.protocol_type)), description: None },
            ProtocolField { name: "Hardware size".to_string(), value: format!("{}", arp.hw_addr_len), raw_value: None, description: None },
            ProtocolField { name: "Protocol size".to_string(), value: format!("{}", arp.proto_addr_len), raw_value: None, description: None },
            ProtocolField { name: "Opcode".to_string(), value: op_name.to_string(), raw_value: Some(format!("{}", arp.operation)), description: None },
            ProtocolField { name: "Sender MAC address".to_string(), value: format_mac(&arp.sender_mac), raw_value: None, description: None },
            ProtocolField { name: "Sender IP address".to_string(), value: arp.sender_ip.to_string(), raw_value: None, description: None },
            ProtocolField { name: "Target MAC address".to_string(), value: format_mac(&arp.target_mac), raw_value: None, description: None },
            ProtocolField { name: "Target IP address".to_string(), value: arp.target_ip.to_string(), raw_value: None, description: None },
        ]),
        children: None,
        raw_value: Some(arp.raw_bytes.clone()),
    }
}

fn build_ipv4_node(ipv4: &Ipv4Packet) -> ProtocolTreeNode {
    ProtocolTreeNode {
        name: "ip".to_string(),
        description: format!("Internet Protocol Version 4, Src: {}, Dst: {}", ipv4.src_ip, ipv4.dst_ip),
        fields: Some(vec![
            ProtocolField { name: "Version".to_string(), value: format!("{}", ipv4.version), raw_value: Some(format!("{:x}", ipv4.version)), description: None },
            ProtocolField { name: "Header Length".to_string(), value: format!("{} bytes", ipv4.ihl), raw_value: None, description: None },
            ProtocolField { name: "Differentiated Services Field".to_string(), value: format!("0x{:02x}", ipv4.tos), raw_value: None, description: None },
            ProtocolField { name: "Total Length".to_string(), value: format!("{}", ipv4.total_length), raw_value: None, description: None },
            ProtocolField { name: "Identification".to_string(), value: format!("0x{:04x} ({})", ipv4.identification, ipv4.identification), raw_value: None, description: None },
            ProtocolField { name: "Flags".to_string(), value: format!("0x{:02x}", ipv4.flags), raw_value: None, description: None },
            ProtocolField { name: "TTL".to_string(), value: format!("{}", ipv4.ttl), raw_value: None, description: None },
            ProtocolField { name: "Protocol".to_string(), value: protocol_name(ipv4.protocol), raw_value: Some(format!("{}", ipv4.protocol)), description: None },
            ProtocolField { name: "Header Checksum".to_string(), value: format!("0x{:04x}", ipv4.checksum), raw_value: None, description: None },
            ProtocolField { name: "Source Address".to_string(), value: ipv4.src_ip.to_string(), raw_value: None, description: None },
            ProtocolField { name: "Destination Address".to_string(), value: ipv4.dst_ip.to_string(), raw_value: None, description: None },
        ]),
        children: None,
        raw_value: Some(ipv4.raw_bytes.clone()),
    }
}

fn build_ipv6_node(ipv6: &Ipv6Packet) -> ProtocolTreeNode {
    ProtocolTreeNode {
        name: "ipv6".to_string(),
        description: format!("Internet Protocol Version 6, Src: {}, Dst: {}", ipv6.src_ip, ipv6.dst_ip),
        fields: Some(vec![
            ProtocolField { name: "Version".to_string(), value: format!("{}", ipv6.version), raw_value: None, description: None },
            ProtocolField { name: "Traffic Class".to_string(), value: format!("0x{:02x}", ipv6.traffic_class), raw_value: None, description: None },
            ProtocolField { name: "Flow Label".to_string(), value: format!("0x{:05x}", ipv6.flow_label), raw_value: None, description: None },
            ProtocolField { name: "Payload Length".to_string(), value: format!("{}", ipv6.payload_length), raw_value: None, description: None },
            ProtocolField { name: "Next Header".to_string(), value: protocol_name(ipv6.next_header), raw_value: Some(format!("{}", ipv6.next_header)), description: None },
            ProtocolField { name: "Hop Limit".to_string(), value: format!("{}", ipv6.hop_limit), raw_value: None, description: None },
            ProtocolField { name: "Source Address".to_string(), value: ipv6.src_ip.to_string(), raw_value: None, description: None },
            ProtocolField { name: "Destination Address".to_string(), value: ipv6.dst_ip.to_string(), raw_value: None, description: None },
        ]),
        children: None,
        raw_value: Some(ipv6.raw_bytes.clone()),
    }
}

fn build_tcp_node(tcp: &TcpSegment) -> ProtocolTreeNode {
    ProtocolTreeNode {
        name: "tcp".to_string(),
        description: format!("Transmission Control Protocol, Src Port: {}, Dst Port: {}, Seq: {}, Ack: {}",
            tcp.src_port, tcp.dst_port, tcp.seq_number, tcp.ack_number),
        fields: Some(vec![
            ProtocolField { name: "Source Port".to_string(), value: format!("{}", tcp.src_port), raw_value: None, description: None },
            ProtocolField { name: "Destination Port".to_string(), value: format!("{}", tcp.dst_port), raw_value: None, description: None },
            ProtocolField { name: "Sequence Number".to_string(), value: format!("{}", tcp.seq_number), raw_value: None, description: None },
            ProtocolField { name: "Acknowledgment Number".to_string(), value: format!("{}", tcp.ack_number), raw_value: None, description: None },
            ProtocolField { name: "Header Length".to_string(), value: format!("{} bytes", tcp.data_offset), raw_value: None, description: None },
            ProtocolField { name: "Flags".to_string(), value: tcp.flags.to_string(), raw_value: Some(format!("0x{:02x}", tcp.flags.to_u8())), description: None },
            ProtocolField { name: "Window Size Value".to_string(), value: format!("{}", tcp.window_size), raw_value: None, description: None },
            ProtocolField { name: "Checksum".to_string(), value: format!("0x{:04x}", tcp.checksum), raw_value: None, description: None },
            ProtocolField { name: "Urgent Pointer".to_string(), value: format!("{}", tcp.urgent_ptr), raw_value: None, description: None },
        ]),
        children: None,
        raw_value: Some(tcp.raw_bytes.clone()),
    }
}

fn build_udp_node(udp: &UdpDatagram) -> ProtocolTreeNode {
    ProtocolTreeNode {
        name: "udp".to_string(),
        description: format!("User Datagram Protocol, Src Port: {}, Dst Port: {}", udp.src_port, udp.dst_port),
        fields: Some(vec![
            ProtocolField { name: "Source Port".to_string(), value: format!("{}", udp.src_port), raw_value: None, description: None },
            ProtocolField { name: "Destination Port".to_string(), value: format!("{}", udp.dst_port), raw_value: None, description: None },
            ProtocolField { name: "Length".to_string(), value: format!("{}", udp.length), raw_value: None, description: None },
            ProtocolField { name: "Checksum".to_string(), value: format!("0x{:04x}", udp.checksum), raw_value: None, description: None },
        ]),
        children: None,
        raw_value: Some(udp.raw_bytes.clone()),
    }
}

fn build_icmp_node(icmp: &IcmpPacket) -> ProtocolTreeNode {
    let type_name = match icmp.message_type {
        0 => "Echo Reply",
        3 => "Destination Unreachable",
        5 => "Redirect",
        8 => "Echo Request",
        9 => "Router Advertisement",
        10 => "Router Solicitation",
        11 => "Time Exceeded",
        12 => "Parameter Problem",
        13 => "Timestamp",
        14 => "Timestamp Reply",
        _ => "Unknown",
    };
    ProtocolTreeNode {
        name: "icmp".to_string(),
        description: format!("Internet Control Message Protocol: {}", type_name),
        fields: Some(vec![
            ProtocolField { name: "Type".to_string(), value: type_name.to_string(), raw_value: Some(format!("{}", icmp.message_type)), description: None },
            ProtocolField { name: "Code".to_string(), value: format!("{}", icmp.code), raw_value: None, description: None },
            ProtocolField { name: "Checksum".to_string(), value: format!("0x{:04x}", icmp.checksum), raw_value: None, description: None },
        ]),
        children: None,
        raw_value: Some(icmp.raw_bytes.clone()),
    }
}

fn build_http_node(http: &HttpMessage) -> ProtocolTreeNode {
    let mut fields = Vec::new();

    if http.is_request {
        if let Some(method) = &http.method {
            fields.push(ProtocolField {
                name: "Request Method".to_string(),
                value: method.clone(),
                raw_value: None,
                description: None,
            });
        }
        if let Some(uri) = &http.uri {
            fields.push(ProtocolField {
                name: "Request URI".to_string(),
                value: uri.clone(),
                raw_value: None,
                description: None,
            });
        }
    } else {
        if let Some(code) = http.status_code {
            fields.push(ProtocolField {
                name: "Status Code".to_string(),
                value: format!("{}", code),
                raw_value: None,
                description: http.status_text.clone(),
            });
        }
    }
    fields.push(ProtocolField {
        name: "Version".to_string(),
        value: http.version.clone(),
        raw_value: None,
        description: None,
    });

    for (name, value) in &http.headers {
        fields.push(ProtocolField {
            name: name.clone(),
            value: value.clone(),
            raw_value: None,
            description: None,
        });
    }

    if !http.body.is_empty() {
        fields.push(ProtocolField {
            name: "Body".to_string(),
            value: format!("{} bytes", http.body.len()),
            raw_value: None,
            description: None,
        });
    }

    let desc = if http.is_request {
        format!("HTTP/{} {} {}", http.version, http.method.as_deref().unwrap_or("?"), http.uri.as_deref().unwrap_or(""))
    } else {
        format!("HTTP/{} {} {}", http.version, http.status_code.unwrap_or(0), http.status_text.as_deref().unwrap_or(""))
    };

    ProtocolTreeNode {
        name: "http".to_string(),
        description: desc,
        fields: if fields.is_empty() { None } else { Some(fields) },
        children: None,
        raw_value: Some(http.raw_bytes.clone()),
    }
}

fn build_dns_node(dns: &DnsMessage) -> ProtocolTreeNode {
    let qr_name = if dns.qr { "Response" } else { "Query" };
    let op_name = match dns.opcode {
        0 => "Standard query",
        1 => "Inverse query",
        2 => "Server status",
        _ => "Unknown",
    };
    let rcode_name = match dns.rcode {
        0 => "No error",
        1 => "Format error",
        2 => "Server failure",
        3 => "Name error",
        4 => "Not implemented",
        5 => "Refused",
        _ => "Unknown",
    };

    let mut fields = vec![
        ProtocolField { name: "Transaction ID".to_string(), value: format!("0x{:04x}", dns.id), raw_value: None, description: None },
        ProtocolField { name: "Flags".to_string(), value: format!("0x{:04x}", dns.flags), raw_value: None, description: None },
        ProtocolField { name: "Response".to_string(), value: qr_name.to_string(), raw_value: None, description: None },
        ProtocolField { name: "Opcode".to_string(), value: op_name.to_string(), raw_value: Some(format!("{}", dns.opcode)), description: None },
        ProtocolField { name: "Authoritative".to_string(), value: if dns.aa { "Yes".to_string() } else { "No".to_string() }, raw_value: None, description: None },
        ProtocolField { name: "Truncated".to_string(), value: if dns.tc { "Yes".to_string() } else { "No".to_string() }, raw_value: None, description: None },
        ProtocolField { name: "Recursion desired".to_string(), value: if dns.rd { "Yes".to_string() } else { "No".to_string() }, raw_value: None, description: None },
        ProtocolField { name: "Recursion available".to_string(), value: if dns.ra { "Yes".to_string() } else { "No".to_string() }, raw_value: None, description: None },
        ProtocolField { name: "Reply code".to_string(), value: rcode_name.to_string(), raw_value: Some(format!("{}", dns.rcode)), description: None },
        ProtocolField { name: "Questions".to_string(), value: format!("{}", dns.questions.len()), raw_value: None, description: None },
        ProtocolField { name: "Answer RRs".to_string(), value: format!("{}", dns.answers.len()), raw_value: None, description: None },
        ProtocolField { name: "Authority RRs".to_string(), value: format!("{}", dns.authorities.len()), raw_value: None, description: None },
        ProtocolField { name: "Additional RRs".to_string(), value: format!("{}", dns.additionals.len()), raw_value: None, description: None },
    ];

    let mut children = Vec::new();

    for (i, q) in dns.questions.iter().enumerate() {
        children.push(ProtocolTreeNode {
            name: format!("question{}", i),
            description: format!("Q: {} {} {}", q.name, qtype_name(q.qtype), qclass_name(q.qclass)),
            fields: Some(vec![
                ProtocolField { name: "Name".to_string(), value: q.name.clone(), raw_value: None, description: None },
                ProtocolField { name: "Type".to_string(), value: qtype_name(q.qtype), raw_value: Some(format!("{}", q.qtype)), description: None },
                ProtocolField { name: "Class".to_string(), value: qclass_name(q.qclass), raw_value: Some(format!("{}", q.qclass)), description: None },
            ]),
            children: None,
            raw_value: None,
        });
    }

    for (i, a) in dns.answers.iter().enumerate() {
        children.push(ProtocolTreeNode {
            name: format!("answer{}", i),
            description: format!("A: {} -> {}", a.name, format_rdata(a.rtype, &a.rdata)),
            fields: Some(vec![
                ProtocolField { name: "Name".to_string(), value: a.name.clone(), raw_value: None, description: None },
                ProtocolField { name: "Type".to_string(), value: qtype_name(a.rtype), raw_value: None, description: None },
                ProtocolField { name: "Class".to_string(), value: qclass_name(a.rclass), raw_value: None, description: None },
                ProtocolField { name: "Time to live".to_string(), value: format!("{}", a.ttl), raw_value: None, description: None },
                ProtocolField { name: "Data length".to_string(), value: format!("{}", a.rdata.len()), raw_value: None, description: None },
            ]),
            children: None,
            raw_value: None,
        });
    }

    ProtocolTreeNode {
        name: "dns".to_string(),
        description: format!("Domain Name System ({})", qr_name),
        fields: Some(fields),
        children: if children.is_empty() { None } else { Some(children) },
        raw_value: Some(dns.raw_bytes.clone()),
    }
}

fn format_mac(mac: &[u8; 6]) -> String {
    format!("{:02x}:{:02x}:{:02x}:{:02x}:{:02x}:{:02x}",
        mac[0], mac[1], mac[2], mac[3], mac[4], mac[5])
}

fn format_bytes_hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{:02x}", b)).collect()
}

fn ether_type_name(etype: u16) -> String {
    match etype {
        ETHERTYPE_IP => "IPv4".to_string(),
        ETHERTYPE_IPV6 => "IPv6".to_string(),
        ETHERTYPE_ARP => "ARP".to_string(),
        _ => format!("Unknown (0x{:04x})", etype),
    }
}

fn protocol_name(proto: u8) -> String {
    match proto {
        IPPROTO_TCP => "TCP".to_string(),
        IPPROTO_UDP => "UDP".to_string(),
        IPPROTO_ICMP => "ICMP".to_string(),
        2 => "IGMP".to_string(),
        89 => "OSPF".to_string(),
        115 => "L2TP".to_string(),
        _ => format!("{}", proto),
    }
}

fn qtype_name(qtype: u16) -> String {
    match qtype {
        1 => "A".to_string(),
        2 => "NS".to_string(),
        5 => "CNAME".to_string(),
        6 => "SOA".to_string(),
        12 => "PTR".to_string(),
        15 => "MX".to_string(),
        16 => "TXT".to_string(),
        28 => "AAAA".to_string(),
        33 => "SRV".to_string(),
        255 => "ANY".to_string(),
        _ => format!("{}", qtype),
    }
}

fn qclass_name(qclass: u16) -> String {
    match qclass {
        1 => "IN".to_string(),
        2 => "CS".to_string(),
        3 => "CH".to_string(),
        4 => "HS".to_string(),
        255 => "ANY".to_string(),
        _ => format!("{}", qclass),
    }
}

fn format_rdata(rtype: u16, rdata: &[u8]) -> String {
    if rtype == 1 && rdata.len() == 4 {
        format!("{}.{}.{}.{}", rdata[0], rdata[1], rdata[2], rdata[3])
    } else if rtype == 28 && rdata.len() == 16 {
        let ip = std::net::Ipv6Addr::from([
            rdata[0], rdata[1], rdata[2], rdata[3],
            rdata[4], rdata[5], rdata[6], rdata[7],
            rdata[8], rdata[9], rdata[10], rdata[11],
            rdata[12], rdata[13], rdata[14], rdata[15],
        ]);
        ip.to_string()
    } else {
        format!("{} bytes", rdata.len())
    }
}

fn is_http_port(port: u16) -> bool {
    HTTP_PORTS.contains(&port)
}

fn arp_info(arp: &ArpPacket) -> String {
    match arp.operation {
        1 => format!("Who has {}? Tell {}", arp.target_ip, arp.sender_ip),
        2 => format!("{} is at {}", arp.sender_ip, format_mac(&arp.sender_mac)),
        _ => format!("ARP (op: {})", arp.operation),
    }
}

fn tcp_info(tcp: &TcpSegment) -> String {
    let flags = tcp.flags.to_string();
    let mut info = format!("{} → {}", tcp.src_port, tcp.dst_port);
    if !flags.is_empty() {
        info.push_str(&format!(" [{}]", flags));
    }
    info.push_str(&format!(" Seq={}", tcp.seq_number));
    if tcp.flags.ack {
        info.push_str(&format!(" Ack={}", tcp.ack_number));
    }
    if !tcp.payload.is_empty() {
        info.push_str(&format!(" Len={}", tcp.payload.len()));
    }
    info
}

fn udp_info(udp: &UdpDatagram) -> String {
    format!("{} → {} Len={}", udp.src_port, udp.dst_port, udp.length)
}

fn icmp_info(icmp: &IcmpPacket) -> String {
    match (icmp.message_type, icmp.code) {
        (0, 0) => "Echo (ping) reply".to_string(),
        (8, 0) => "Echo (ping) request".to_string(),
        (3, 0) => "Destination unreachable (network)".to_string(),
        (3, 1) => "Destination unreachable (host)".to_string(),
        (3, 3) => "Destination unreachable (port)".to_string(),
        (11, 0) => "Time-to-live exceeded".to_string(),
        (t, c) => format!("Type {} Code {}", t, c),
    }
}

fn http_info(http: &HttpMessage) -> String {
    if http.is_request {
        format!("{} {} HTTP/{}",
            http.method.as_deref().unwrap_or("?"),
            http.uri.as_deref().unwrap_or(""),
            http.version
        )
    } else {
        format!("HTTP/{} {} {}",
            http.version,
            http.status_code.unwrap_or(0),
            http.status_text.as_deref().unwrap_or("")
        )
    }
}

fn dns_info(dns: &DnsMessage) -> String {
    let qr = if dns.qr { "Standard query response" } else { "Standard query" };
    if let Some(q) = dns.questions.first() {
        format!("{} 0x{:04x} {} {} {}", qr, dns.id, q.name, qtype_name(q.qtype), qclass_name(q.qclass))
    } else {
        format!("{} 0x{:04x}", qr, dns.id)
    }
}
