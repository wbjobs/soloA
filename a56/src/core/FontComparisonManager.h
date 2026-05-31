#ifndef FONTCOMPARISONMANAGER_H
#define FONTCOMPARISONMANAGER_H

#include <QObject>
#include <QString>
#include <QList>
#include <QMap>
#include <QImage>
#include <QChar>
#include <QSharedPointer>

#include "core/FontParser.h"
#include "core/KerningPair.h"
#include "render/FontRenderer.h"

struct FontComparisonResult
{
    QString fontPath;
    QString fontName;
    int kerningValue;
    int displayKerning;
    QImage previewImage;
    int textWidth;
};

struct ComparisonReport
{
    QChar leftChar;
    QChar rightChar;
    QList<FontComparisonResult> fontResults;
    int averageKerning;
    int minKerning;
    int maxKerning;
    int standardDeviation;
    QList<QString> outliers;

    bool operator==(const ComparisonReport& other) const {
        return leftChar == other.leftChar && rightChar == other.rightChar;
    }
};

class FontComparisonManager : public QObject
{
    Q_OBJECT
public:
    explicit FontComparisonManager(QObject* parent = nullptr);
    ~FontComparisonManager();

    void setFontPaths(const QStringList& paths);
    void addFontPath(const QString& path);
    void removeFontPath(const QString& path);
    void clearFonts();

    QStringList fontPaths() const;
    int fontCount() const;

    void setPreviewText(const QString& text);
    QString previewText() const;

    void setPreviewSize(int size);
    int previewSize() const;

    ComparisonReport comparePair(QChar left, QChar right);
    QList<ComparisonReport> compareAllPairs(
        const QList<QChar>& leftChars,
        const QList<QChar>& rightChars
    );

    QList<ComparisonReport> findInconsistencies(
        const QList<QChar>& leftChars,
        const QList<QChar>& rightChars,
        double threshold = 2.0
    );

    QMap<QString, QList<KerningPair>> getUnifiedKerning(
        const QList<ComparisonReport>& reports,
        int targetFontIndex = -1
    );

    QImage createComparisonChart(const ComparisonReport& report);
    QList<QImage> createComparisonCharts(const QList<ComparisonReport>& reports);

signals:
    void comparisonProgress(int current, int total);
    void comparisonFinished(const QList<ComparisonReport>& reports);

private:
    QStringList m_fontPaths;
    QString m_previewText;
    int m_previewSize;
    FontRenderer* m_renderer;

    int calculateStandardDeviation(const QList<int>& values, int average);
    QString getFontDisplayName(const QString& fontPath);
};

#endif
