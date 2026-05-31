#include "io/ConfigManager.h"
#include <QStandardPaths>
#include <QDir>
#include <QDebug>

ConfigManager* ConfigManager::m_instance = nullptr;

ConfigManager::ConfigManager(QObject* parent)
    : QObject(parent)
    , m_qtSettings(new QSettings("KerningAdjuster", "KerningAdjuster", this))
{
}

ConfigManager::~ConfigManager()
{
    save();
}

ConfigManager* ConfigManager::instance()
{
    if (!m_instance) {
        m_instance = new ConfigManager();
    }
    return m_instance;
}

void ConfigManager::load()
{
    m_settings.lastOpenDirectory = m_qtSettings->value(
        "lastOpenDirectory",
        QStandardPaths::writableLocation(QStandardPaths::DocumentsLocation)
    ).toString();

    m_settings.lastExportDirectory = m_qtSettings->value(
        "lastExportDirectory",
        QStandardPaths::writableLocation(QStandardPaths::DocumentsLocation)
    ).toString();

    m_settings.previewFontSize = m_qtSettings->value("previewFontSize", 48).toInt();
    m_settings.defaultFontSize = m_qtSettings->value("defaultFontSize", 48).toInt();
    m_settings.previewText = m_qtSettings->value("previewText", "AVAWAVTeTo").toString();
    m_settings.showModifiedOnly = m_qtSettings->value("showModifiedOnly", false).toBool();
    m_settings.autoSave = m_qtSettings->value("autoSave", true).toBool();
    m_settings.autoSaveInterval = m_qtSettings->value("autoSaveInterval", 5).toInt();

    emit settingsChanged();
}

void ConfigManager::save()
{
    m_qtSettings->setValue("lastOpenDirectory", m_settings.lastOpenDirectory);
    m_qtSettings->setValue("lastExportDirectory", m_settings.lastExportDirectory);
    m_qtSettings->setValue("previewFontSize", m_settings.previewFontSize);
    m_qtSettings->setValue("defaultFontSize", m_settings.defaultFontSize);
    m_qtSettings->setValue("previewText", m_settings.previewText);
    m_qtSettings->setValue("showModifiedOnly", m_settings.showModifiedOnly);
    m_qtSettings->setValue("autoSave", m_settings.autoSave);
    m_qtSettings->setValue("autoSaveInterval", m_settings.autoSaveInterval);
    m_qtSettings->sync();

    emit settingsChanged();
}

AppSettings& ConfigManager::settings()
{
    return m_settings;
}

const AppSettings& ConfigManager::settings() const
{
    return m_settings;
}

void ConfigManager::setValue(const QString& key, const QVariant& value)
{
    m_qtSettings->setValue(key, value);
}

QVariant ConfigManager::value(const QString& key, const QVariant& defaultValue) const
{
    return m_qtSettings->value(key, defaultValue);
}

QString ConfigManager::configFilePath() const
{
    return m_qtSettings->fileName();
}
