import smtplib
import json
import requests
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.utils import formataddr
from typing import List, Dict, Any, Optional
from datetime import datetime

from ..config import settings


class EmailNotificationService:
    def __init__(self):
        self.enabled = settings.EMAIL_NOTIFICATION_ENABLED
        self.smtp_host = settings.EMAIL_SMTP_HOST
        self.smtp_port = settings.EMAIL_SMTP_PORT
        self.smtp_user = settings.EMAIL_SMTP_USER
        self.smtp_password = settings.EMAIL_SMTP_PASSWORD
        self.email_from = settings.EMAIL_FROM
        self.email_to = settings.EMAIL_TO
        self.use_tls = settings.EMAIL_USE_TLS

    def send_alert(
        self,
        alert: Dict[str, Any],
        root_cause: Optional[Dict[str, Any]] = None,
        report_url: str = ""
    ) -> Dict[str, Any]:
        if not self.enabled:
            return {
                "success": False,
                "message": "Email notification is disabled",
                "channel": "email"
            }
        
        if not self.email_to:
            return {
                "success": False,
                "message": "No recipients configured",
                "channel": "email"
            }
        
        try:
            msg = self._build_alert_message(alert, root_cause, report_url)
            
            with smtplib.SMTP(self.smtp_host, self.smtp_port) as server:
                if self.use_tls:
                    server.starttls()
                
                if self.smtp_user and self.smtp_password:
                    server.login(self.smtp_user, self.smtp_password)
                
                for recipient in self.email_to:
                    recipient = recipient.strip()
                    if recipient:
                        msg['To'] = recipient
                        server.sendmail(
                            self.email_from or self.smtp_user,
                            recipient,
                            msg.as_string()
                        )
            
            return {
                "success": True,
                "message": "Email sent successfully",
                "channel": "email",
                "recipients": self.email_to,
                "sent_at": datetime.now().isoformat()
            }
        
        except Exception as e:
            return {
                "success": False,
                "message": f"Email send failed: {str(e)}",
                "channel": "email",
                "error": str(e)
            }

    def _build_alert_message(
        self,
        alert: Dict[str, Any],
        root_cause: Optional[Dict[str, Any]] = None,
        report_url: str = ""
    ) -> MIMEMultipart:
        msg = MIMEMultipart('alternative')
        msg['From'] = formataddr(('IoT Analytics Platform', self.email_from or self.smtp_user))
        msg['Subject'] = self._build_subject(alert)
        
        html_content = self._build_html_content(alert, root_cause, report_url)
        text_content = self._build_text_content(alert, root_cause, report_url)
        
        msg.attach(MIMEText(text_content, 'plain', 'utf-8'))
        msg.attach(MIMEText(html_content, 'html', 'utf-8'))
        
        return msg

    def _build_subject(self, alert: Dict[str, Any]) -> str:
        severity_emoji = {
            'critical': '🔴',
            'high': '🟠',
            'medium': '🟡',
            'low': '🟢'
        }
        
        severity = alert.get('severity', 'medium')
        emoji = severity_emoji.get(severity, '⚠️')
        device = alert.get('device_id', 'unknown')
        sensor = alert.get('sensor_type', 'unknown')
        
        return f"{emoji} [IoT告警] {device} - {sensor} 检测到异常"

    def _build_html_content(
        self,
        alert: Dict[str, Any],
        root_cause: Optional[Dict[str, Any]] = None,
        report_url: str = ""
    ) -> str:
        severity_colors = {
            'critical': '#dc3545',
            'high': '#fd7e14',
            'medium': '#ffc107',
            'low': '#28a745'
        }
        
        severity_labels = {
            'critical': '严重',
            'high': '高',
            'medium': '中',
            'low': '低'
        }
        
        severity = alert.get('severity', 'medium')
        color = severity_colors.get(severity, '#ffc107')
        label = severity_labels.get(severity, severity)
        
        html = f"""
        <html>
        <head>
            <style>
                body {{ font-family: 'Microsoft YaHei', Arial, sans-serif; line-height: 1.6; color: #333; }}
                .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
                .header {{ background: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 20px; }}
                .severity-badge {{ 
                    display: inline-block; 
                    padding: 4px 12px; 
                    border-radius: 4px; 
                    color: white; 
                    font-weight: bold;
                    background: {color};
                }}
                .alert-info {{ background: #fff3cd; border-left: 4px solid {color}; padding: 15px; margin: 15px 0; }}
                .root-cause {{ background: #e7f3ff; border-left: 4px solid #1890ff; padding: 15px; margin: 15px 0; }}
                .btn {{ 
                    display: inline-block; 
                    padding: 12px 24px; 
                    background: #1890ff; 
                    color: white !important; 
                    text-decoration: none; 
                    border-radius: 6px;
                    margin-top: 20px;
                }}
                .footer {{ margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; color: #666; font-size: 12px; }}
                table {{ width: 100%; border-collapse: collapse; margin: 15px 0; }}
                td {{ padding: 8px 12px; border-bottom: 1px solid #eee; }}
                .label {{ color: #666; width: 100px; }}
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h2 style="margin: 0;">🔔 工业物联网数据分析平台 - 告警通知</h2>
                </div>
                
                <div class="alert-info">
                    <div style="margin-bottom: 10px;">
                        <span class="severity-badge">{label}告警</span>
                    </div>
                    <table>
                        <tr><td class="label">告警ID:</td><td>{alert.get('id', 'N/A')}</td></tr>
                        <tr><td class="label">设备:</td><td><strong>{alert.get('device_id', 'N/A')}</strong></td></tr>
                        <tr><td class="label">传感器:</td><td>{alert.get('sensor_type', 'N/A')}</td></tr>
                        <tr><td class="label">异常值:</td><td><strong style="color: #dc3545;">{alert.get('anomaly_value', 'N/A')}</strong></td></tr>
                        <tr><td class="label">告警时间:</td><td>{alert.get('timestamp', 'N/A')}</td></tr>
                        <tr><td class="label">状态:</td><td>{'活跃' if alert.get('status') == 'active' else '已处理'}</td></tr>
                    </table>
                </div>
        """
        
        if root_cause and root_cause.get('has_root_cause'):
            primary = root_cause.get('primary_root_cause', {})
            html += f"""
                <div class="root-cause">
                    <h3 style="margin-top: 0; color: #1890ff;">🔍 根因分析推荐</h3>
                    <table>
                        <tr><td class="label">推荐根因:</td><td><strong>{primary.get('fault_location', 'N/A')}</strong></td></tr>
                        <tr><td class="label">置信度:</td><td><strong>{primary.get('confidence', 0) * 100:.1f}%</strong></td></tr>
                        <tr><td class="label">评分:</td><td>{primary.get('score', 0):.3f}</td></tr>
                    </table>
                    
                    <div style="margin-top: 10px;">
                        <strong>📋 推荐检查步骤:</strong>
                        <ol>
            """
            
            for i, rec in enumerate(root_cause.get('recommendations', []), 1):
                html += f"<li>{rec}</li>"
            
            html += """
                        </ol>
                    </div>
                </div>
            """
        
        if report_url:
            html += f"""
                <div style="text-align: center; margin: 20px 0;">
                    <a href="{report_url}" class="btn">📊 查看详细分析报告</a>
                </div>
            """
        
        html += """
                <div class="footer">
                    <p>此邮件由工业物联网数据分析平台自动发送，请勿直接回复。</p>
                    <p>如有疑问，请联系系统管理员。</p>
                </div>
            </div>
        </body>
        </html>
        """
        
        return html

    def _build_text_content(
        self,
        alert: Dict[str, Any],
        root_cause: Optional[Dict[str, Any]] = None,
        report_url: str = ""
    ) -> str:
        text = f"""
============================================
        工业物联网数据分析平台 - 告警通知
============================================

【告警详情】
告警ID: {alert.get('id', 'N/A')}
设备: {alert.get('device_id', 'N/A')}
传感器: {alert.get('sensor_type', 'N/A')}
异常值: {alert.get('anomaly_value', 'N/A')}
告警时间: {alert.get('timestamp', 'N/A')}
状态: {'活跃' if alert.get('status') == 'active' else '已处理'}

"""
        
        if root_cause and root_cause.get('has_root_cause'):
            primary = root_cause.get('primary_root_cause', {})
            text += f"""
【根因分析推荐】
推荐根因: {primary.get('fault_location', 'N/A')}
置信度: {primary.get('confidence', 0) * 100:.1f}%
评分: {primary.get('score', 0):.3f}

推荐检查步骤:
"""
            for i, rec in enumerate(root_cause.get('recommendations', []), 1):
                text += f"{i}. {rec}\n"
        
        if report_url:
            text += f"\n📊 详细报告: {report_url}\n"
        
        text += """
============================================
此邮件由系统自动发送，请勿直接回复。
============================================
"""
        
        return text

    def send_batch_alerts(
        self,
        alerts: List[Dict[str, Any]],
        root_causes: Optional[Dict[str, Any]] = None,
        report_url: str = ""
    ) -> List[Dict[str, Any]]:
        results = []
        for alert in alerts:
            root_cause = root_causes.get(alert.get('id')) if root_causes else None
            result = self.send_alert(alert, root_cause, report_url)
            results.append(result)
        return results


class WeChatNotificationService:
    def __init__(self):
        self.enabled = settings.WECHAT_NOTIFICATION_ENABLED
        self.webhook_url = settings.WECHAT_WEBHOOK_URL
        self.mentioned_list = settings.WECHAT_MENTIONED_LIST
        self.mentioned_mobile_list = settings.WECHAT_MENTIONED_MOBILE_LIST

    def send_alert(
        self,
        alert: Dict[str, Any],
        root_cause: Optional[Dict[str, Any]] = None,
        report_url: str = ""
    ) -> Dict[str, Any]:
        if not self.enabled:
            return {
                "success": False,
                "message": "WeChat notification is disabled",
                "channel": "wechat"
            }
        
        if not self.webhook_url:
            return {
                "success": False,
                "message": "Webhook URL not configured",
                "channel": "wechat"
            }
        
        try:
            message = self._build_message(alert, root_cause, report_url)
            
            response = requests.post(
                self.webhook_url,
                json=message,
                headers={'Content-Type': 'application/json'},
                timeout=10
            )
            
            result = response.json()
            
            if result.get('errcode') == 0:
                return {
                    "success": True,
                    "message": "WeChat message sent successfully",
                    "channel": "wechat",
                    "sent_at": datetime.now().isoformat()
                }
            else:
                return {
                    "success": False,
                    "message": f"WeChat API error: {result.get('errmsg', 'Unknown error')}",
                    "channel": "wechat",
                    "error_code": result.get('errcode')
                }
        
        except Exception as e:
            return {
                "success": False,
                "message": f"WeChat send failed: {str(e)}",
                "channel": "wechat",
                "error": str(e)
            }

    def _build_message(
        self,
        alert: Dict[str, Any],
        root_cause: Optional[Dict[str, Any]] = None,
        report_url: str = ""
    ) -> Dict[str, Any]:
        severity_emoji = {
            'critical': '🔴',
            'high': '🟠',
            'medium': '🟡',
            'low': '🟢'
        }
        
        severity_labels = {
            'critical': '严重',
            'high': '高',
            'medium': '中',
            'low': '低'
        }
        
        severity = alert.get('severity', 'medium')
        emoji = severity_emoji.get(severity, '⚠️')
        label = severity_labels.get(severity, severity)
        
        content = [
            f"{emoji} **IoT告警通知**",
            "",
            f"> **告警级别**: <font color=\"{'comment' if severity == 'low' else 'warning' if severity == 'medium' else 'warning'}\">{label}</font>",
            f"> **设备**: {alert.get('device_id', 'N/A')}",
            f"> **传感器**: {alert.get('sensor_type', 'N/A')}",
            f"> **异常值**: <font color=\"warning\">{alert.get('anomaly_value', 'N/A')}</font>",
            f"> **时间**: {alert.get('timestamp', 'N/A')}",
            ""
        ]
        
        if root_cause and root_cause.get('has_root_cause'):
            primary = root_cause.get('primary_root_cause', {})
            content.extend([
                "🔍 **根因分析推荐**:",
                f"> 推荐根因: <font color=\"info\">{primary.get('fault_location', 'N/A')}</font>",
                f"> 置信度: {primary.get('confidence', 0) * 100:.1f}%",
                ""
            ])
        
        if report_url:
            content.extend([
                f"📊 [查看详细报告]({report_url})",
                ""
            ])
        
        content.append("---")
        content.append("<@all>" if not self.mentioned_list else "")
        
        message = {
            "msgtype": "markdown",
            "markdown": {
                "content": "\n".join(content)
            }
        }
        
        if self.mentioned_list or self.mentioned_mobile_list:
            message["at"] = {}
            if self.mentioned_list:
                message["at"]["mentioned_list"] = self.mentioned_list
            if self.mentioned_mobile_list:
                message["at"]["mentioned_mobile_list"] = self.mentioned_mobile_list
        
        return message


class NotificationManager:
    _instance = None
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._initialized = False
        return cls._instance
    
    def __init__(self):
        if self._initialized:
            return
        
        self.email_service = EmailNotificationService()
        self.wechat_service = WeChatNotificationService()
        self._initialized = True
    
    def send_notification(
        self,
        alert: Dict[str, Any],
        root_cause: Optional[Dict[str, Any]] = None,
        report_url: str = "",
        channels: Optional[List[str]] = None
    ) -> Dict[str, Any]:
        results = {}
        
        if channels is None:
            channels = ["email", "wechat"]
        
        if "email" in channels:
            results["email"] = self.email_service.send_alert(alert, root_cause, report_url)
        
        if "wechat" in channels:
            results["wechat"] = self.wechat_service.send_alert(alert, root_cause, report_url)
        
        return {
            "alert_id": alert.get('id'),
            "timestamp": datetime.now().isoformat(),
            "results": results,
            "success_count": sum(1 for r in results.values() if r.get('success')),
            "failed_count": sum(1 for r in results.values() if not r.get('success'))
        }
    
    def get_service_status(self) -> Dict[str, Any]:
        return {
            "email": {
                "enabled": self.email_service.enabled,
                "configured": bool(self.email_service.email_to)
            },
            "wechat": {
                "enabled": self.wechat_service.enabled,
                "configured": bool(self.wechat_service.webhook_url)
            }
        }
