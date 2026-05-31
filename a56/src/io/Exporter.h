#ifndef EXPORTER_H
#define EXPORTER_H

#include <QObject>
#include <QString>
#include <QList>
#include <nlohmann/json.hpp>

#include "core/KerningAdjuster.h"

class Exporter : public QObject
{
    Q_OBJECT
public:
    enum class Format {
        JSON,
        CSV,
        Font
    };

    explicit Exporter(QObject* parent = nullptr);
    ~Exporter();

    bool exportToJSON(const QString& filePath, KerningAdjuster* adjuster, bool onlyModified = true);
    bool importFromJSON(const QString& filePath, KerningAdjuster* adjuster);

    bool exportToCSV(const QString& filePath, KerningAdjuster* adjuster, bool onlyModified = true);
    bool importFromCSV(const QString& filePath, KerningAdjuster* adjuster);

    bool exportToFont(const QString& sourceFontPath, const QString& outputPath, KerningAdjuster* adjuster);

    QString lastError() const;

signals:
    void exportProgress(int current, int total);
    void exportFinished(bool success);

private:
    QString m_lastError;

    nlohmann::json toJSON(KerningAdjuster* adjuster, bool onlyModified);
    bool fromJSON(const nlohmann::json& j, KerningAdjuster* adjuster);
};

#endif
