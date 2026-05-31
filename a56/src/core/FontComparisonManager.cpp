#include "core/FontComparisonManager.h"
#include <QPainter>
#include <QFileInfo>
#include <QDebug>
#include <QtMath>

FontComparisonManager::FontComparisonManager(QObject* parent)
    : QObject(parent)
    , m_previewText(QStringLiteral("AVAWAVTeTo"))
    , m_previewSize(36)
    , m_renderer(new FontRenderer(this))
{
}

FontComparisonManager::~FontComparisonManager()
{
}

void FontComparisonManager::setFontPaths(const QStringList& paths)
{
    m_fontPaths = paths;
}

void FontComparisonManager::addFontPath(const QString& path)
{
    if (!m_fontPaths.contains(path)) {
        m_fontPaths.append(path);
    }
}

void FontComparisonManager::removeFontPath(const QString& path)
{
    m_fontPaths.removeAll(path);
}

void FontComparisonManager::clearFonts()
{
    m_fontPaths.clear();
}

QStringList FontComparisonManager::fontPaths() const
{
    return m_fontPaths;
}

int FontComparisonManager::fontCount() const
{
    return m_fontPaths.size();
}

void FontComparisonManager::setPreviewText(const QString& text)
{
    m_previewText = text;
}

QString FontComparisonManager::previewText() const
{
    return m_previewText;
}

void FontComparisonManager::setPreviewSize(int size)
{
    m_previewSize = size;
}

int FontComparisonManager::previewSize() const
{
    return m_previewSize;
}

ComparisonReport FontComparisonManager::comparePair(QChar left, QChar right)
{
    ComparisonReport report;
    report.leftChar = left;
    report.rightChar = right;

    if (m_fontPaths.isEmpty()) {
        return report;
    }

    QList<int> allKerningValues;

    for (const QString& fontPath : m_fontPaths) {
        FontComparisonResult result;
        result.fontPath = fontPath;
        result.fontName = getFontDisplayName(fontPath);

        if (m_renderer->loadFont(fontPath, m_previewSize)) {
            QString pairStr = QString("%1%2").arg(left).arg(right);
            result.previewImage = m_renderer->renderText(pairStr);
            result.textWidth = m_renderer->textWidth(pairStr);

            int kerning = 0;
            QMap<QString, int> emptyKerning;
            int widthWithKerning = m_renderer->textWidth(pairStr, true, emptyKerning);
            int widthWithoutKerning = m_renderer->textWidth(pairStr, false, emptyKerning);
            kerning = widthWithKerning - widthWithoutKerning;

            result.kerningValue = kerning;
            result.displayKerning = kerning;
            allKerningValues.append(kerning);
        }

        report.fontResults.append(result);
    }

    if (!allKerningValues.isEmpty()) {
        int sum = 0;
        report.minKerning = INT_MAX;
        report.maxKerning = INT_MIN;

        for (int v : allKerningValues) {
            sum += v;
            if (v < report.minKerning) report.minKerning = v;
            if (v > report.maxKerning) report.maxKerning = v;
        }
        report.averageKerning = sum / allKerningValues.size();
        report.standardDeviation = calculateStandardDeviation(allKerningValues, report.averageKerning);

        double threshold = 2.0 * report.standardDeviation;
        for (const FontComparisonResult& r : report.fontResults) {
            if (qAbs(r.kerningValue - report.averageKerning) > threshold) {
                report.outliers.append(r.fontName);
            }
        }
    }

    return report;
}

QList<ComparisonReport> FontComparisonManager::compareAllPairs(
    const QList<QChar>& leftChars,
    const QList<QChar>& rightChars
)
{
    QList<ComparisonReport> reports;

    int total = leftChars.size() * rightChars.size();
    int processed = 0;

    for (QChar left : leftChars) {
        for (QChar right : rightChars) {
            if (left != right) {
                ComparisonReport report = comparePair(left, right);
                reports.append(report);
            }
            processed++;
            emit comparisonProgress(processed, total);
        }
    }

    emit comparisonFinished(reports);
    return reports;
}

QList<ComparisonReport> FontComparisonManager::findInconsistencies(
    const QList<QChar>& leftChars,
    const QList<QChar>& rightChars,
    double threshold
)
{
    QList<ComparisonReport> allReports = compareAllPairs(leftChars, rightChars);
    QList<ComparisonReport> inconsistent;

    for (const ComparisonReport& report : allReports) {
        if (report.fontResults.size() >= 2) {
            if (report.standardDeviation > threshold) {
                inconsistent.append(report);
            }
        }
    }

    return inconsistent;
}

QMap<QString, QList<KerningPair>> FontComparisonManager::getUnifiedKerning(
    const QList<ComparisonReport>& reports,
    int targetFontIndex
)
{
    QMap<QString, QList<KerningPair>> unified;

    for (const ComparisonReport& report : reports) {
        int targetValue = 0;

        if (targetFontIndex >= 0 && targetFontIndex < report.fontResults.size()) {
            targetValue = report.fontResults[targetFontIndex].kerningValue;
        } else {
            targetValue = report.averageKerning;
        }

        for (const FontComparisonResult& result : report.fontResults) {
            if (result.kerningValue != targetValue) {
                KerningPair pair(report.leftChar, report.rightChar, targetValue);
                unified[result.fontPath].append(pair);
            }
        }
    }

    return unified;
}

QImage FontComparisonManager::createComparisonChart(const ComparisonReport& report)
{
    if (report.fontResults.isEmpty()) {
        return QImage();
    }

    int chartWidth = 600;
    int chartHeight = 200;
    int padding = 50;
    int barWidth = 40;
    int gap = 20;

    QImage chart(chartWidth, chartHeight, QImage::Format_ARGB32_Premultiplied);
    chart.fill(Qt::white);

    QPainter painter(&chart);
    painter.setRenderHint(QPainter::Antialiasing);

    int minVal = report.minKerning - 10;
    int maxVal = report.maxKerning + 10;
    int valueRange = maxVal - minVal;

    int axisX = padding;
    int axisY = chartHeight - padding;
    int axisEndY = padding;
    int axisEndX = chartWidth - padding;

    painter.setPen(QPen(Qt::black, 1));
    painter.drawLine(axisX, axisY, axisEndX, axisY);
    painter.drawLine(axisX, axisY, axisX, axisEndY);

    int zeroY = axisY - ((0 - minVal) * (axisY - axisEndY) / valueRange);
    painter.setPen(QPen(Qt::gray, 1, Qt::DashLine));
    painter.drawLine(axisX, zeroY, axisEndX, zeroY);

    int totalBarWidth = report.fontResults.size() * barWidth + (report.fontResults.size() - 1) * gap;
    int startX = axisX + (axisEndX - axisX - totalBarWidth) / 2;

    QList<QColor> colors = {
        QColor(52, 152, 219),
        QColor(46, 204, 113),
        QColor(155, 89, 182),
        QColor(241, 196, 15),
        QColor(231, 76, 60),
        QColor(26, 188, 156)
    };

    painter.setFont(QFont("Arial", 9));
    for (int i = 0; i < report.fontResults.size(); ++i) {
        const FontComparisonResult& result = report.fontResults[i];
        QColor color = colors[i % colors.size()];

        int value = result.kerningValue;
        int barHeight = qAbs(value - minVal) * (axisY - axisEndY) / valueRange;
        int barY = value >= 0 ? zeroY - barHeight : zeroY;
        int actualHeight = value >= 0 ? barHeight : qAbs((value - minVal) * (axisY - axisEndY) / valueRange - (zeroY - axisEndY));

        int x = startX + i * (barWidth + gap);

        painter.setBrush(QBrush(color));
        painter.setPen(Qt::NoPen);
        painter.drawRect(x, barY, barWidth, actualHeight);

        painter.setPen(Qt::black);
        painter.drawText(x, barY - 5, QString::number(value));

        QRect labelRect(x - 10, axisY + 5, barWidth + 20, 40);
        painter.drawText(labelRect, Qt::AlignCenter | Qt::TextWordWrap, result.fontName);
    }

    painter.setPen(Qt::black);
    painter.setFont(QFont("Arial", 10, QFont::Bold));
    QString title = QString("字距对比: %1%2 (平均: %3, 标准差: %4)")
        .arg(report.leftChar)
        .arg(report.rightChar)
        .arg(report.averageKerning)
        .arg(report.standardDeviation);
    painter.drawText(QRect(0, 5, chartWidth, 20), Qt::AlignCenter, title);

    painter.end();
    return chart;
}

QList<QImage> FontComparisonManager::createComparisonCharts(const QList<ComparisonReport>& reports)
{
    QList<QImage> charts;
    for (const ComparisonReport& report : reports) {
        QImage chart = createComparisonChart(report);
        if (!chart.isNull()) {
            charts.append(chart);
        }
    }
    return charts;
}

int FontComparisonManager::calculateStandardDeviation(const QList<int>& values, int average)
{
    if (values.size() <= 1) return 0;

    double sumSquaredDiff = 0.0;
    for (int v : values) {
        double diff = v - average;
        sumSquaredDiff += diff * diff;
    }

    double variance = sumSquaredDiff / (values.size() - 1);
    return static_cast<int>(qSqrt(variance));
}

QString FontComparisonManager::getFontDisplayName(const QString& fontPath)
{
    QFileInfo fi(fontPath);
    QString name = fi.baseName();

    name = name.replace('_', ' ');
    name = name.replace('-', ' ');

    if (name.length() > 15) {
        name = name.left(12) + "...";
    }

    return name;
}
