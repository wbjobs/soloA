use crate::types::*;
use crate::errors::*;
use base64::{Engine as _, engine::general_purpose};
use sha2::{Sha256, Digest};
use chrono::{DateTime, Utc, TimeZone};

pub fn parse_certificate_der(der_data: &[u8], index: usize) -> Result<X509Certificate> {
    let (_, cert) = x509_parser::parse_x509_certificate(der_data)
        .map_err(|e| AnalyzerError::Parse(format!("Failed to parse X.509 certificate: {}", e)))?;

    let pem_string = der_to_pem(der_data);

    let version = cert.version().0 as u32 + 1;

    let serial_number = cert.serial.to_str_radix(16);

    let signature_algorithm = cert.signature_algorithm.algorithm.to_string();

    let issuer = parse_name(&cert.issuer);
    let subject = parse_name(&cert.subject);

    let not_before = asn1_time_to_timestamp(&cert.validity.not_before);
    let not_after = asn1_time_to_timestamp(&cert.validity.not_after);

    let now = Utc::now().timestamp();
    let is_valid_now = now >= not_before && now <= not_after;

    let is_self_signed = issuer.raw_string == subject.raw_string;

    let public_key_algorithm = cert.public_key.algorithm.algorithm.to_string();
    let public_key_bytes = cert.public_key.raw.to_vec();

    let sans = extract_sans(&cert);
    let key_usage = extract_key_usage(&cert);
    let extended_key_usage = extract_extended_key_usage(&cert);

    let fingerprint_sha256 = compute_fingerprint_sha256(der_data);

    Ok(X509Certificate {
        index,
        raw_der: der_data.to_vec(),
        pem_string,
        version,
        serial_number,
        signature_algorithm,
        issuer,
        subject,
        not_before,
        not_after,
        public_key_algorithm,
        public_key_bytes,
        sans,
        key_usage,
        extended_key_usage,
        is_valid_now,
        is_self_signed,
        fingerprint_sha256,
    })
}

fn parse_name(name: &x509_parser::x509::X509Name) -> CertificateName {
    let mut cn = None;
    let mut org = None;
    let mut org_unit = None;
    let mut locality = None;
    let mut state = None;
    let mut country = None;
    let mut email = None;

    for attr in name.iter() {
        let value = attr.as_str().unwrap_or("").to_string();
        if value.is_empty() {
            continue;
        }

        let oid = attr.attr_type.to_string();
        match oid.as_str() {
            "2.5.4.3" => cn = Some(value),
            "2.5.4.10" => org = Some(value),
            "2.5.4.11" => org_unit = Some(value),
            "2.5.4.7" => locality = Some(value),
            "2.5.4.8" => state = Some(value),
            "2.5.4.6" => country = Some(value),
            "1.2.840.113549.1.9.1" => email = Some(value),
            _ => {}
        }
    }

    let raw_string = name.to_string();

    CertificateName {
        common_name: cn,
        organization: org,
        organizational_unit: org_unit,
        locality,
        state,
        country,
        email,
        raw_string,
    }
}

fn asn1_time_to_timestamp(time: &x509_parser::time::ASN1Time) -> i64 {
    time.timestamp()
}

fn extract_sans(cert: &x509_parser::certificate::X509Certificate) -> Vec<String> {
    let mut sans = Vec::new();

    if let Some(ext) = cert.subject_alternative_name() {
        if let Ok((_, gn)) = ext {
            for name in &gn.general_names {
                match name {
                    x509_parser::extensions::GeneralName::DNSName(dns) => {
                        sans.push(dns.to_string());
                    }
                    x509_parser::extensions::GeneralName::IPAddress(ip) => {
                        if let Ok(ip_str) = std::str::from_utf8(ip) {
                            sans.push(ip_str.to_string());
                        } else if ip.len() == 4 {
                            sans.push(format!("{}.{}.{}.{}", ip[0], ip[1], ip[2], ip[3]));
                        }
                    }
                    x509_parser::extensions::GeneralName::RFC822Name(email) => {
                        sans.push(email.to_string());
                    }
                    _ => {}
                }
            }
        }
    }

    sans
}

fn extract_key_usage(cert: &x509_parser::certificate::X509Certificate) -> Option<Vec<String>> {
    if let Some(ext) = cert.key_usage() {
        if let Ok((_, ku)) = ext {
            let mut usages = Vec::new();
            if ku.digital_signature() { usages.push("digitalSignature".to_string()); }
            if ku.non_repudiation() { usages.push("nonRepudiation".to_string()); }
            if ku.key_encipherment() { usages.push("keyEncipherment".to_string()); }
            if ku.data_encipherment() { usages.push("dataEncipherment".to_string()); }
            if ku.key_agreement() { usages.push("keyAgreement".to_string()); }
            if ku.key_cert_sign() { usages.push("keyCertSign".to_string()); }
            if ku.crl_sign() { usages.push("cRLSign".to_string()); }
            if ku.encipher_only() { usages.push("encipherOnly".to_string()); }
            if ku.decipher_only() { usages.push("decipherOnly".to_string()); }
            return Some(usages);
        }
    }
    None
}

fn extract_extended_key_usage(cert: &x509_parser::certificate::X509Certificate) -> Option<Vec<String>> {
    if let Some(ext) = cert.extended_key_usage() {
        if let Ok((_, eku)) = ext {
            let mut usages = Vec::new();
            if eku.server_auth { usages.push("serverAuth".to_string()); }
            if eku.client_auth { usages.push("clientAuth".to_string()); }
            if eku.code_signing { usages.push("codeSigning".to_string()); }
            if eku.email_protection { usages.push("emailProtection".to_string()); }
            if eku.time_stamping { usages.push("timeStamping".to_string()); }
            if eku.ocsp_signing { usages.push("OCSPSigning".to_string()); }
            return Some(usages);
        }
    }
    None
}

fn compute_fingerprint_sha256(data: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(data);
    let result = hasher.finalize();
    result.iter()
        .map(|b| format!("{:02x}", b))
        .collect::<Vec<String>>()
        .join(":")
}

pub fn der_to_pem(der: &[u8]) -> String {
    let b64 = general_purpose::STANDARD.encode(der);
    let mut pem = String::new();
    pem.push_str("-----BEGIN CERTIFICATE-----\n");
    
    for (i, chunk) in b64.chars().collect::<Vec<char>>().chunks(64).enumerate() {
        if i > 0 {
            pem.push_str("\n");
        }
        pem.extend(chunk);
    }
    
    pem.push_str("\n-----END CERTIFICATE-----\n");
    pem
}

pub fn parse_certificate_chain(der_certs: &[Vec<u8>]) -> Result<Vec<X509Certificate>> {
    let mut certs = Vec::new();
    for (i, der) in der_certs.iter().enumerate() {
        match parse_certificate_der(der, i) {
            Ok(cert) => certs.push(cert),
            Err(e) => {
                eprintln!("[WARN] Failed to parse certificate {}: {}", i, e);
            }
        }
    }
    Ok(certs)
}

pub fn format_timestamp(ts: i64) -> String {
    if let Some(dt) = Utc.timestamp_opt(ts, 0).single() {
        dt.format("%Y-%m-%d %H:%M:%S UTC").to_string()
    } else {
        format!("Timestamp {}", ts)
    }
}

pub fn validate_certificate(cert: &X509Certificate) -> Vec<String> {
    let mut issues = Vec::new();
    let now = Utc::now().timestamp();

    if now < cert.not_before {
        issues.push(format!("Certificate not yet valid. Valid from {}", format_timestamp(cert.not_before)));
    }

    if now > cert.not_after {
        issues.push(format!("Certificate expired. Valid until {}", format_timestamp(cert.not_after)));
    }

    if cert.is_self_signed {
        issues.push("Self-signed certificate detected".to_string());
    }

    issues
}
