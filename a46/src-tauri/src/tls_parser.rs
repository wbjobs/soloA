use crate::types::*;
use crate::errors::*;
use std::collections::HashMap;

lazy_static::lazy_static! {
    static ref TLS_CIPHER_SUITES: HashMap<u16, &'static str> = {
        let mut m = HashMap::new();
        m.insert(0x002f, "TLS_RSA_WITH_AES_128_CBC_SHA");
        m.insert(0x0033, "TLS_RSA_WITH_AES_128_CBC_SHA256");
        m.insert(0x0035, "TLS_RSA_WITH_AES_256_CBC_SHA");
        m.insert(0x0039, "TLS_RSA_WITH_AES_256_CBC_SHA256");
        m.insert(0x003c, "TLS_RSA_WITH_AES_128_GCM_SHA256");
        m.insert(0x009c, "TLS_RSA_WITH_AES_128_GCM_SHA256");
        m.insert(0x009d, "TLS_RSA_WITH_AES_256_GCM_SHA384");
        m.insert(0xc013, "TLS_ECDHE_RSA_WITH_AES_128_CBC_SHA");
        m.insert(0xc014, "TLS_ECDHE_RSA_WITH_AES_256_CBC_SHA");
        m.insert(0xc02b, "TLS_ECDHE_ECDSA_WITH_AES_128_GCM_SHA256");
        m.insert(0xc02c, "TLS_ECDHE_ECDSA_WITH_AES_256_GCM_SHA384");
        m.insert(0xc02f, "TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256");
        m.insert(0xc030, "TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384");
        m.insert(0x1301, "TLS_AES_128_GCM_SHA256");
        m.insert(0x1302, "TLS_AES_256_GCM_SHA384");
        m.insert(0x1303, "TLS_CHACHA20_POLY1305_SHA256");
        m
    };
}

pub fn get_cipher_suite_name(code: u16) -> String {
    TLS_CIPHER_SUITES
        .get(&code)
        .map(|&s| s.to_string())
        .unwrap_or_else(|| format!("Unknown (0x{:04x})", code))
}

pub fn tls_version_to_string(major: u8, minor: u8) -> String {
    match (major, minor) {
        (3, 0) => "SSL 3.0".to_string(),
        (3, 1) => "TLS 1.0".to_string(),
        (3, 2) => "TLS 1.1".to_string(),
        (3, 3) => "TLS 1.2".to_string(),
        (3, 4) => "TLS 1.3".to_string(),
        _ => format!("Unknown ({}.{})", major, minor),
    }
}

pub fn parse_tls_plaintext(data: &[u8]) -> Result<Vec<TlsMessage>> {
    let mut messages = Vec::new();
    let mut offset = 0;

    while offset < data.len() {
        if offset + 5 > data.len() {
            break;
        }

        let content_type = data[offset];
        let major = data[offset + 1];
        let minor = data[offset + 2];
        let version = ((major as u16) << 8) | (minor as u16);
        let length = ((data[offset + 3] as u16) << 8) | (data[offset + 4] as u16);

        offset += 5;

        if offset + length as usize > data.len() {
            break;
        }

        let payload = data[offset..offset + length as usize].to_vec();
        offset += length as usize;

        messages.push(TlsMessage {
            content_type,
            version,
            length,
            payload,
        });
    }

    Ok(messages)
}

pub fn parse_tls_handshake(data: &[u8]) -> Result<TlsHandshakeMessage> {
    if data.len() < 4 {
        return Err(AnalyzerError::Parse("TLS handshake too short".into()));
    }

    let handshake_type = match data[0] {
        1 => TlsHandshakeType::ClientHello,
        2 => TlsHandshakeType::ServerHello,
        11 => TlsHandshakeType::Certificate,
        12 => TlsHandshakeType::ServerKeyExchange,
        14 => TlsHandshakeType::ServerHelloDone,
        16 => TlsHandshakeType::ClientKeyExchange,
        20 => TlsHandshakeType::Finished,
        other => TlsHandshakeType::Unknown(other),
    };

    let length = ((data[1] as u32) << 16) | ((data[2] as u32) << 8) | (data[3] as u32);

    if (data.len() as u32) < 4 + length {
        return Err(AnalyzerError::Parse("TLS handshake length mismatch".into()));
    }

    let handshake_body = &data[4..4 + length as usize];

    match handshake_type {
        TlsHandshakeType::ClientHello => parse_client_hello(handshake_body, data.to_vec()),
        TlsHandshakeType::ServerHello => parse_server_hello(handshake_body, data.to_vec()),
        _ => Ok(TlsHandshakeMessage {
            handshake_type,
            version: None,
            random: Vec::new(),
            session_id: None,
            cipher_suites: Vec::new(),
            server_name: None,
            compression_methods: None,
            extensions: Vec::new(),
            selected_cipher_suite: None,
            raw_bytes: data.to_vec(),
        }),
    }
}

fn parse_client_hello(data: &[u8], raw: Vec<u8>) -> Result<TlsHandshakeMessage> {
    if data.len() < 34 {
        return Err(AnalyzerError::Parse("ClientHello too short".into()));
    }

    let mut offset = 0;

    let major = data[offset];
    let minor = data[offset + 1];
    offset += 2;

    let version = tls_version_to_string(major, minor);
    let random = data[offset..offset + 32].to_vec();
    offset += 32;

    let session_id_len = data[offset] as usize;
    offset += 1;
    let session_id = if session_id_len > 0 && offset + session_id_len <= data.len() {
        let sid = data[offset..offset + session_id_len].to_vec();
        offset += session_id_len;
        Some(sid)
    } else {
        None
    };

    let cipher_suites_len = ((data[offset] as u16) << 8) | (data[offset + 1] as u16);
    offset += 2;

    let mut cipher_suites = Vec::new();
    let num_ciphers = cipher_suites_len as usize / 2;
    for i in 0..num_ciphers {
        let code_pos = offset + i * 2;
        if code_pos + 2 > data.len() {
            break;
        }
        let code = ((data[code_pos] as u16) << 8) | (data[code_pos + 1] as u16);
        let name = get_cipher_suite_name(code);
        cipher_suites.push(TlsCipherSuite { code, name });
    }
    offset += cipher_suites_len as usize;

    let compression_methods_len = data[offset] as usize;
    offset += 1;
    let compression_methods = if compression_methods_len > 0 && offset + compression_methods_len <= data.len() {
        let methods = data[offset..offset + compression_methods_len].to_vec();
        offset += compression_methods_len;
        Some(methods)
    } else {
        None
    };

    let mut extensions = Vec::new();
    let mut server_name = None;

    if offset + 2 <= data.len() {
        let extensions_len = ((data[offset] as u16) << 8) | (data[offset + 1] as u16);
        offset += 2;

        let extensions_end = offset + extensions_len as usize;
        while offset + 4 <= extensions_end && offset + 4 <= data.len() {
            let ext_type = ((data[offset] as u16) << 8) | (data[offset + 1] as u16);
            let ext_len = ((data[offset + 2] as u16) << 8) | (data[offset + 3] as u16);
            offset += 4;

            if offset + ext_len as usize > data.len() {
                break;
            }

            let ext_data = &data[offset..offset + ext_len as usize];

            let ext_name = match ext_type {
                0 => {
                    if let Some(sni) = parse_sni_extension(ext_data) {
                        server_name = Some(sni);
                    }
                    "server_name".to_string()
                }
                10 => "supported_groups".to_string(),
                11 => "ec_point_formats".to_string(),
                13 => "signature_algorithms".to_string(),
                16 => "application_layer_protocol_negotiation".to_string(),
                18 => "signed_certificate_timestamp".to_string(),
                35 => "session_ticket".to_string(),
                43 => "supported_versions".to_string(),
                45 => "psk_key_exchange_modes".to_string(),
                51 => "key_share".to_string(),
                other => format!("unknown (type {})", other),
            };

            extensions.push((ext_type, ext_name));

            offset += ext_len as usize;
        }
    }

    Ok(TlsHandshakeMessage {
        handshake_type: TlsHandshakeType::ClientHello,
        version: Some(version),
        random,
        session_id,
        cipher_suites,
        server_name,
        compression_methods,
        extensions,
        selected_cipher_suite: None,
        raw_bytes: raw,
    })
}

fn parse_server_hello(data: &[u8], raw: Vec<u8>) -> Result<TlsHandshakeMessage> {
    if data.len() < 38 {
        return Err(AnalyzerError::Parse("ServerHello too short".into()));
    }

    let mut offset = 0;

    let major = data[offset];
    let minor = data[offset + 1];
    offset += 2;

    let version = tls_version_to_string(major, minor);
    let random = data[offset..offset + 32].to_vec();
    offset += 32;

    let session_id_len = data[offset] as usize;
    offset += 1;
    let session_id = if session_id_len > 0 && offset + session_id_len <= data.len() {
        let sid = data[offset..offset + session_id_len].to_vec();
        offset += session_id_len;
        Some(sid)
    } else {
        None
    };

    let cipher_code = ((data[offset] as u16) << 8) | (data[offset + 1] as u16);
    offset += 2;
    let cipher_name = get_cipher_suite_name(cipher_code);
    let selected_cipher_suite = Some(TlsCipherSuite {
        code: cipher_code,
        name: cipher_name,
    });

    let compression_method = data[offset];
    offset += 1;

    let mut extensions = Vec::new();

    if offset + 2 <= data.len() {
        let extensions_len = ((data[offset] as u16) << 8) | (data[offset + 1] as u16);
        offset += 2;

        let extensions_end = offset + extensions_len as usize;
        while offset + 4 <= extensions_end && offset + 4 <= data.len() {
            let ext_type = ((data[offset] as u16) << 8) | (data[offset + 1] as u16);
            let ext_len = ((data[offset + 2] as u16) << 8) | (data[offset + 3] as u16);
            offset += 4;

            if offset + ext_len as usize > data.len() {
                break;
            }

            let ext_name = match ext_type {
                0 => "server_name".to_string(),
                10 => "supported_groups".to_string(),
                11 => "ec_point_formats".to_string(),
                13 => "signature_algorithms".to_string(),
                14 => "renegotiation_info".to_string(),
                16 => "application_layer_protocol_negotiation".to_string(),
                43 => "supported_versions".to_string(),
                45 => "psk_key_exchange_modes".to_string(),
                51 => "key_share".to_string(),
                other => format!("unknown (type {})", other),
            };

            extensions.push((ext_type, ext_name));

            offset += ext_len as usize;
        }
    }

    Ok(TlsHandshakeMessage {
        handshake_type: TlsHandshakeType::ServerHello,
        version: Some(version),
        random,
        session_id,
        cipher_suites: Vec::new(),
        server_name: None,
        compression_methods: Some(vec![compression_method]),
        extensions,
        selected_cipher_suite,
        raw_bytes: raw,
    })
}

fn parse_sni_extension(data: &[u8]) -> Option<String> {
    if data.len() < 5 {
        return None;
    }

    let list_len = ((data[0] as u16) << 8) | (data[1] as u16);
    let mut offset = 2;
    let list_end = offset + list_len as usize;

    while offset + 3 <= list_end && offset + 3 <= data.len() {
        let name_type = data[offset];
        let name_len = ((data[offset + 1] as u16) << 8) | (data[offset + 2] as u16);
        offset += 3;

        if name_type == 0 {
            if offset + name_len as usize <= data.len() {
                let name = String::from_utf8_lossy(&data[offset..offset + name_len as usize]).to_string();
                return Some(name);
            }
        }

        offset += name_len as usize;
    }

    None
}

pub fn parse_tls_certificate_message(data: &[u8]) -> Result<Vec<Vec<u8>>> {
    if data.len() < 4 {
        return Err(AnalyzerError::Parse("TLS Certificate message too short".into()));
    }

    let handshake_type = data[0];
    if handshake_type != 11 {
        return Err(AnalyzerError::Parse("Not a Certificate handshake message".into()));
    }

    let length = ((data[1] as u32) << 16) | ((data[2] as u32) << 8) | (data[3] as u32);
    if (data.len() as u32) < 4 + length {
        return Err(AnalyzerError::Parse("Certificate message length mismatch".into()));
    }

    let certs_data = &data[4..4 + length as usize];
    parse_certificate_chain(certs_data)
}

pub fn parse_certificate_chain(data: &[u8]) -> Result<Vec<Vec<u8>>> {
    if data.len() < 3 {
        return Err(AnalyzerError::Parse("Certificate chain too short".into()));
    }

    let chain_len = ((data[0] as u32) << 16) | ((data[1] as u32) << 8) | (data[2] as u32);
    let mut offset = 3;
    let chain_end = offset + chain_len as usize;

    let mut certificates = Vec::new();

    while offset + 3 <= chain_end && offset + 3 <= data.len() {
        let cert_len = ((data[offset] as u32) << 16) | ((data[offset + 1] as u32) << 8) | (data[offset + 2] as u32);
        offset += 3;

        if offset + cert_len as usize > data.len() {
            break;
        }

        let cert_data = data[offset..offset + cert_len as usize].to_vec();
        certificates.push(cert_data);

        offset += cert_len as usize;
    }

    Ok(certificates)
}

pub fn is_tls_data(data: &[u8], src_port: u16, dst_port: u16) -> bool {
    if data.len() < 6 {
        return false;
    }

    if src_port != HTTPS_PORT && dst_port != HTTPS_PORT {
        return false;
    }

    let content_type = data[0];
    let major = data[1];
    let minor = data[2];

    if major != 3 {
        return false;
    }

    if minor < 0 || minor > 4 {
        return false;
    }

    match content_type {
        20..=23 | 25 => true,
        _ => false,
    }
}

pub fn build_tls_tree_node(tls_msg: &TlsHandshakeMessage, raw_bytes: &[u8]) -> ProtocolTreeNode {
    let mut fields = Vec::new();

    if let Some(version) = &tls_msg.version {
        fields.push(ProtocolField {
            name: "Version".to_string(),
            value: version.clone(),
            raw_value: None,
            description: None,
        });
    }

    if let Some(sni) = &tls_msg.server_name {
        fields.push(ProtocolField {
            name: "Server Name Indication (SNI)".to_string(),
            value: sni.clone(),
            raw_value: None,
            description: None,
        });
    }

    if let Some(selected) = &tls_msg.selected_cipher_suite {
        fields.push(ProtocolField {
            name: "Selected Cipher Suite".to_string(),
            value: selected.name.clone(),
            raw_value: Some(format!("0x{:04x}", selected.code)),
            description: None,
        });
    }

    if !tls_msg.cipher_suites.is_empty() {
        fields.push(ProtocolField {
            name: "Cipher Suites".to_string(),
            value: format!("{} suites supported", tls_msg.cipher_suites.len()),
            raw_value: None,
            description: None,
        });
    }

    if !tls_msg.extensions.is_empty() {
        fields.push(ProtocolField {
            name: "Extensions".to_string(),
            value: format!("{} extensions present", tls_msg.extensions.len()),
            raw_value: None,
            description: None,
        });
    }

    let desc = match tls_msg.handshake_type {
        TlsHandshakeType::ClientHello => {
            if let Some(sni) = &tls_msg.server_name {
                format!("TLS ClientHello: {}", sni)
            } else {
                "TLS ClientHello".to_string()
            }
        }
        TlsHandshakeType::ServerHello => {
            if let Some(cs) = &tls_msg.selected_cipher_suite {
                format!("TLS ServerHello: {}", cs.name)
            } else {
                "TLS ServerHello".to_string()
            }
        }
        TlsHandshakeType::Certificate => "TLS Certificate".to_string(),
        TlsHandshakeType::Finished => "TLS Finished".to_string(),
        _ => "TLS Handshake".to_string(),
    };

    ProtocolTreeNode {
        name: "tls".to_string(),
        description: desc,
        fields: if fields.is_empty() { None } else { Some(fields) },
        children: None,
        raw_value: Some(raw_bytes.to_vec()),
    }
}
