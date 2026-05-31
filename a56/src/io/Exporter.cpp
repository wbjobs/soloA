#include "io/Exporter.h"
#include <QFile>
#include <QTextStream>
#include <QFileInfo>
#include <QDebug>
#include <QDateTime>

using json = nlohmann::json;

Exporter::Exporter(QObject* parent)
    : QObject(parent)
{
}

Exporter::~Exporter()
{
}

bool Exporter::exportToJSON(const QString& filePath, KerningAdjuster* adjuster, bool onlyModified)
{
    if (!adjuster || !adjuster->fontInfo()) {
        m_lastError = QStringLiteral("没有加载的字体");
        emit exportFinished(false);
        return false;
    }

    QFile file(filePath);
    if (!file.open(QIODevice::WriteOnly | QIODevice::Text)) {
        m_lastError = QStringLiteral("无法打开文件: %1").arg(filePath);
        emit exportFinished(false);
        return false;
    }

    json j = toJSON(adjuster, onlyModified);

    QTextStream out(&file);
    out << QString::fromStdString(j.dump(4));
    file.close();

    emit exportFinished(true);
    return true;
}

bool Exporter::importFromJSON(const QString& filePath, KerningAdjuster* adjuster)
{
    if (!adjuster) {
        m_lastError = QStringLiteral("无效的调整器");
        return false;
    }

    QFile file(filePath);
    if (!file.open(QIODevice::ReadOnly | QIODevice::Text)) {
        m_lastError = QStringLiteral("无法打开文件: %1").arg(filePath);
        return false;
    }

    QTextStream in(&file);
    QString content = in.readAll();
    file.close();

    try {
        json j = json::parse(content.toStdString());
        return fromJSON(j, adjuster);
    } catch (const std::exception& e) {
        m_lastError = QStringLiteral("JSON 解析错误: %1").arg(QString::fromStdString(e.what()));
        return false;
    }
}

bool Exporter::exportToCSV(const QString& filePath, KerningAdjuster* adjuster, bool onlyModified)
{
    if (!adjuster || !adjuster->fontInfo()) {
        m_lastError = QStringLiteral("没有加载的字体");
        emit exportFinished(false);
        return false;
    }

    QList<KerningPair> pairs = onlyModified ? adjuster->modifiedPairs() : adjuster->kerningPairs();
    if (pairs.isEmpty()) {
        m_lastError = QStringLiteral("没有要导出的字距对");
        emit exportFinished(false);
        return false;
    }

    QFile file(filePath);
    if (!file.open(QIODevice::WriteOnly | QIODevice::Text)) {
        m_lastError = QStringLiteral("无法打开文件: %1").arg(filePath);
        emit exportFinished(false);
        return false;
    }

    QTextStream out(&file);
    out.setCodec("UTF-8");

    out << QStringLiteral("左字符,右字符,当前值,原始值,是否修改\n");

    for (int i = 0; i < pairs.size(); ++i) {
        const KerningPair& pair = pairs[i];
        out << QStringLiteral("\"%1\",\"%2\",%3,%4,%5\n")
               .arg(pair.leftChar())
               .arg(pair.rightChar())
               .arg(pair.value())
               .arg(pair.originalValue())
               .arg(pair.isModified() ? "yes" : "no");

        emit exportProgress(i + 1, pairs.size());
    }

    file.close();
    emit exportFinished(true);
    return true;
}

bool Exporter::importFromCSV(const QString& filePath, KerningAdjuster* adjuster)
{
    if (!adjuster) {
        m_lastError = QStringLiteral("无效的调整器");
        return false;
    }

    QFile file(filePath);
    if (!file.open(QIODevice::ReadOnly | QIODevice::Text)) {
        m_lastError = QStringLiteral("无法打开文件: %1").arg(filePath);
        return false;
    }

    QTextStream in(&file);
    in.setCodec("UTF-8");

    QStringList lines = in.readAll().split('\n');
    file.close();

    bool firstLine = true;
    int imported = 0;

    for (const QString& line : lines) {
        if (line.trimmed().isEmpty()) continue;
        if (firstLine) {
            firstLine = false;
            continue;
        }

        QStringList parts = line.split(',');
        if (parts.size() < 3) continue;

        QString leftStr = parts[0].trimmed();
        QString rightStr = parts[1].trimmed();
        QString valueStr = parts[2].trimmed();

        leftStr.remove('"');
        rightStr.remove('"');

        if (leftStr.isEmpty() || rightStr.isEmpty()) continue;

        QChar left = leftStr[0];
        QChar right = rightStr[0];
        int value = valueStr.toInt();

        if (adjuster->hasKerningPair(left, right)) {
            adjuster->setKerningValue(left, right, value);
            ++imported;
        } else {
            adjuster->addKerningPair(left, right, value);
            ++imported;
        }
    }

    return imported > 0;
}

bool Exporter::exportToFont(const QString& sourceFontPath, const QString& outputPath, KerningAdjuster* adjuster)
{
    if (!adjuster || !adjuster->fontInfo()) {
        m_lastError = QStringLiteral("没有加载的字体");
        emit exportFinished(false);
        return false;
    }

    QFileInfo sourceInfo(sourceFontPath);
    if (!sourceInfo.exists()) {
        m_lastError = QStringLiteral("源字体文件不存在");
        emit exportFinished(false);
        return false;
    }

    QFile sourceFile(sourceFontPath);
    QFile destFile(outputPath);

    if (!sourceFile.open(QIODevice::ReadOnly)) {
        m_lastError = QStringLiteral("无法打开源字体文件: %1").arg(sourceFile.errorString());
        emit exportFinished(false);
        return false;
    }

    if (QFile::exists(outputPath)) {
        QFile::remove(outputPath);
    }

    if (!destFile.open(QIODevice::WriteOnly | QIODevice::Truncate)) {
        m_lastError = QStringLiteral("无法创建目标文件: %1").arg(destFile.errorString());
        emit exportFinished(false);
        return false;
    }

    const qint64 bufferSize = 1024 * 1024;
    QByteArray buffer(bufferSize, 0);
    qint64 bytesRead;
    qint64 totalBytes = sourceFile.size();
    qint64 copiedBytes = 0;

    while ((bytesRead = sourceFile.read(buffer.data(), bufferSize)) > 0) {
        qint64 bytesWritten = destFile.write(buffer.data(), bytesRead);
        if (bytesWritten != bytesRead) {
            m_lastError = QStringLiteral("写入文件时出错");
            destFile.close();
            sourceFile.close();
            emit exportFinished(false);
            return false;
        }
        copiedBytes += bytesRead;
        emit exportProgress(static_cast<int>(copiedBytes), static_cast<int>(totalBytes));
    }

    sourceFile.close();
    destFile.close();

    if (bytesRead < 0) {
        m_lastError = QStringLiteral("读取源文件时出错: %1").arg(sourceFile.errorString());
        emit exportFinished(false);
        return false;
    }

    m_lastError = QStringLiteral("字体文件已成功复制。\n\n"
                                 "注意：Kerning Adjuster 目前不支持直接修改字体文件的字距表。\n"
                                 "字距数据已保存为 JSON 格式，可用于专业字体编辑器（如 FontForge）。\n\n"
                                 "字距数据文件: %1.kerning.json").arg(outputPath);

    QString jsonPath = outputPath + ".kerning.json";
    exportToJSON(jsonPath, adjuster, true);

    emit exportFinished(true);
    return true;
}

QString Exporter::lastError() const
{
    return m_lastError;
}

json Exporter::toJSON(KerningAdjuster* adjuster, bool onlyModified)
{
    QList<KerningPair> pairs = onlyModified ? adjuster->modifiedPairs() : adjuster->kerningPairs();
    auto info = adjuster->fontInfo();

    json j;
    j["font_path"] = info->filePath.toStdString();
    j["font_family"] = info->familyName.toStdString();
    j["font_style"] = info->styleName.toStdString();
    j["units_per_em"] = info->unitsPerEm;
    j["export_all"] = !onlyModified;
    j["export_time"] = QDateTime::currentDateTime().toString(Qt::ISODate).toStdString();

    json kerningArray = json::array();
    for (const KerningPair& pair : pairs) {
        json k;
        k["left"] = QString(pair.leftChar()).toStdString();
        k["right"] = QString(pair.rightChar()).toStdString();
        k["left_code"] = pair.leftChar().unicode();
        k["right_code"] = pair.rightChar().unicode();
        k["value"] = pair.value();
        k["original_value"] = pair.originalValue();
        k["delta"] = pair.value() - pair.originalValue();
        k["modified"] = pair.isModified();
        kerningArray.push_back(k);
    }

    j["kerning_pairs"] = kerningArray;
    j["pair_count"] = pairs.size();

    return j;
}

bool Exporter::fromJSON(const json& j, KerningAdjuster* adjuster)
{
    if (!j.contains("kerning_pairs") || !j["kerning_pairs"].is_array()) {
        m_lastError = QStringLiteral("JSON 格式错误：缺少 kerning_pairs 数组");
        return false;
    }

    int imported = 0;
    const auto& pairs = j["kerning_pairs"];

    for (const auto& item : pairs) {
        try {
            QChar left, right;
            int value = 0;

            if (item.contains("left_code") && item.contains("right_code")) {
                left = QChar(static_cast<ushort>(item["left_code"].get<int>()));
                right = QChar(static_cast<ushort>(item["right_code"].get<int>()));
            } else if (item.contains("left") && item.contains("right")) {
                QString leftStr = QString::fromStdString(item["left"].get<std::string>());
                QString rightStr = QString::fromStdString(item["right"].get<std::string>());
                if (!leftStr.isEmpty()) left = leftStr[0];
                if (!rightStr.isEmpty()) right = rightStr[0];
            }

            if (item.contains("value")) {
                value = item["value"].get<int>();
            } else if (item.contains("delta") && adjuster->hasKerningPair(left, right)) {
                int delta = item["delta"].get<int>();
                value = adjuster->originalKerningValue(left, right) + delta;
            }

            if (!left.isNull() && !right.isNull()) {
                if (adjuster->hasKerningPair(left, right)) {
                    adjuster->setKerningValue(left, right, value);
                } else {
                    adjuster->addKerningPair(left, right, value);
                }
                ++imported;
            }
        } catch (const std::exception& e) {
            qWarning() << "解析字距对时出错:" << e.what();
        }
    }

    return imported > 0;
}
