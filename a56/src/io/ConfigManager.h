#ifndef CONFIGMANAGER_H
#define CONFIGMANAGER_H

#include <QObject>
#include <QString>
#include <QVariant>
#include <QSettings>
#include <nlohmann/json.hpp>

struct AppSettings
{
    QString lastOpenDirectory;
    QString lastExportDirectory;
    int previewFontSize;
    int defaultFontSize;
    QString previewText;
    bool showModifiedOnly;
    bool autoSave;
    int autoSaveInterval;

    AppSettings()
        : previewFontSize(48)
        , defaultFontSize(48)
        , previewText(QStringLiteral("AVAWAVTeTo"))
        , showModifiedOnly(false)
        , autoSave(true)
        , autoSaveInterval(5)
    {}
};

class ConfigManager : public QObject
{
    Q_OBJECT
public:
    static ConfigManager* instance();

    void load();
    void save();

    AppSettings& settings();
    const AppSettings& settings() const;

    void setValue(const QString& key, const QVariant& value);
    QVariant value(const QString& key, const QVariant& defaultValue = QVariant()) const;

    QString configFilePath() const;

signals:
    void settingsChanged();

private:
    explicit ConfigManager(QObject* parent = nullptr);
    ~ConfigManager();

    static ConfigManager* m_instance;
    AppSettings m_settings;
    QSettings* m_qtSettings;
};

#endif
