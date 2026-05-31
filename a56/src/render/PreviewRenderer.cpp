#include "render/PreviewRenderer.h"
#include <QPainter>
#include <QDebug>

PreviewRenderer::PreviewRenderer(QObject* parent)
    : QObject(parent)
    , m_adjuster(nullptr)
    , m_renderer(new FontRenderer(this))
    , m_previewText(QStringLiteral("AVAWAVTeTo"))
    , m_fontSize(48)
    , m_mode(Mode::SideBySide)
{
}

PreviewRenderer::~PreviewRenderer()
{
}

void PreviewRenderer::setAdjuster(KerningAdjuster* adjuster)
{
    m_adjuster = adjuster;
    emit previewChanged();
}

void PreviewRenderer::setPreviewText(const QString& text)
{
    if (m_previewText != text) {
        m_previewText = text;
        emit previewChanged();
    }
}

QString PreviewRenderer::previewText() const
{
    return m_previewText;
}

void PreviewRenderer::setFontSize(int size)
{
    if (m_fontSize != size) {
        m_fontSize = size;
        m_renderer->setFontSize(size);
        emit previewChanged();
    }
}

int PreviewRenderer::fontSize() const
{
    return m_fontSize;
}

void PreviewRenderer::setMode(Mode mode)
{
    if (m_mode != mode) {
        m_mode = mode;
        emit previewChanged();
    }
}

PreviewRenderer::Mode PreviewRenderer::mode() const
{
    return m_mode;
}

QImage PreviewRenderer::renderPreview()
{
    switch (m_mode) {
    case Mode::Overlay:
        return renderOverlay();
    case Mode::Difference:
        return renderDifference();
    case Mode::SideBySide:
    default: {
        QImage original = renderOriginal();
        QImage adjusted = renderAdjusted();

        if (original.isNull() && adjusted.isNull()) {
            return QImage();
        }

        int width = qMax(original.width(), adjusted.width()) + 20;
        int height = original.height() + adjusted.height() + 30;

        QImage result(width, height, QImage::Format_ARGB32_Premultiplied);
        result.fill(Qt::white);

        QPainter painter(&result);
        painter.setRenderHint(QPainter::Antialiasing);
        painter.setPen(Qt::black);
        painter.setFont(QFont("Arial", 10));

        painter.drawText(10, 15, QStringLiteral("原始:"));
        if (!original.isNull()) {
            painter.drawImage(10, 25, original);
        }

        painter.drawText(10, original.height() + 40, QStringLiteral("调整后:"));
        if (!adjusted.isNull()) {
            painter.drawImage(10, original.height() + 50, adjusted);
        }

        painter.end();
        return result;
    }
    }
}

QImage PreviewRenderer::renderOriginal()
{
    if (!m_adjuster || !m_adjuster->fontInfo()) {
        return QImage();
    }

    QString fontPath = m_adjuster->fontInfo()->filePath;
    if (!m_renderer->loadFont(fontPath, m_fontSize)) {
        qWarning() << "无法加载字体:" << fontPath;
        return QImage();
    }

    return m_renderer->renderText(m_previewText, Qt::black, true, {});
}

QImage PreviewRenderer::renderAdjusted()
{
    if (!m_adjuster || !m_adjuster->fontInfo()) {
        return QImage();
    }

    QString fontPath = m_adjuster->fontInfo()->filePath;
    if (!m_renderer->loadFont(fontPath, m_fontSize)) {
        qWarning() << "无法加载字体:" << fontPath;
        return QImage();
    }

    QMap<QString, int> customKerning = buildCustomKerningMap();
    return m_renderer->renderText(m_previewText, Qt::black, true, customKerning);
}

QSize PreviewRenderer::calculateSize() const
{
    if (!m_adjuster || !m_adjuster->fontInfo()) {
        return QSize(0, 0);
    }

    FontRenderer tempRenderer;
    QString fontPath = m_adjuster->fontInfo()->filePath;
    if (!tempRenderer.loadFont(fontPath, m_fontSize)) {
        return QSize(0, 0);
    }

    int width1 = tempRenderer.textWidth(m_previewText);
    QMap<QString, int> customKerning;
    if (m_adjuster) {
        for (const KerningPair& pair : m_adjuster->modifiedPairs()) {
            QString key = pair.pairString();
            int original = pair.originalValue();
            int current = pair.value();
            int delta = (current - original) * m_fontSize / m_adjuster->fontInfo()->unitsPerEm;
            customKerning.insert(key, delta);
        }
    }
    int width2 = tempRenderer.textWidth(m_previewText, true, customKerning);

    int maxWidth = qMax(width1, width2) + 40;
    int lineHeight = tempRenderer.lineHeight() + 20;

    return QSize(maxWidth, lineHeight * 2 + 50);
}

QMap<QString, int> PreviewRenderer::buildCustomKerningMap() const
{
    QMap<QString, int> customKerning;
    if (!m_adjuster || !m_adjuster->fontInfo()) {
        return customKerning;
    }

    int unitsPerEm = m_adjuster->fontInfo()->unitsPerEm;
    if (unitsPerEm <= 0) {
        unitsPerEm = 1000;
    }

    for (const KerningPair& pair : m_adjuster->modifiedPairs()) {
        QString key = pair.pairString();
        int original = pair.originalValue();
        int current = pair.value();
        int delta = current - original;

        int pixelDelta = delta * m_fontSize / unitsPerEm;
        customKerning.insert(key, pixelDelta);
    }

    return customKerning;
}

QImage PreviewRenderer::renderOverlay()
{
    QImage original = renderOriginal();
    QImage adjusted = renderAdjusted();

    if (original.isNull() && adjusted.isNull()) {
        return QImage();
    }

    int width = qMax(original.width(), adjusted.width());
    int height = qMax(original.height(), adjusted.height());

    QImage result(width, height, QImage::Format_ARGB32_Premultiplied);
    result.fill(Qt::white);

    QPainter painter(&result);
    painter.setRenderHint(QPainter::Antialiasing);

    if (!original.isNull()) {
        painter.setOpacity(0.5);
        painter.drawImage(0, 0, original);
    }

    if (!adjusted.isNull()) {
        painter.setOpacity(1.0);
        for (int y = 0; y < adjusted.height(); ++y) {
            for (int x = 0; x < adjusted.width(); ++x) {
                QRgb pixel = adjusted.pixel(x, y);
                int alpha = qAlpha(pixel);
                if (alpha > 0) {
                    result.setPixel(x, y, qRgba(255, 0, 0, alpha));
                }
            }
        }
    }

    painter.end();
    return result;
}

QImage PreviewRenderer::renderDifference()
{
    QImage original = renderOriginal();
    QImage adjusted = renderAdjusted();

    if (original.isNull() && adjusted.isNull()) {
        return QImage();
    }

    int width = qMax(original.width(), adjusted.width());
    int height = qMax(original.height(), adjusted.height());

    QImage result(width, height, QImage::Format_ARGB32_Premultiplied);
    result.fill(Qt::white);

    int offset = 0;
    for (int i = 1; i < m_previewText.length(); ++i) {
        QString pair = m_previewText.mid(i-1, 2);
        QMap<QString, int> customKerning = buildCustomKerningMap();
        if (customKerning.contains(pair)) {
            offset += customKerning[pair];
        }
    }

    QPainter painter(&result);
    painter.setRenderHint(QPainter::Antialiasing);

    if (!original.isNull()) {
        painter.drawImage(0, 0, original);
    }

    if (!adjusted.isNull()) {
        painter.setOpacity(0.7);
        painter.drawImage(offset, 0, adjusted);
    }

    painter.end();
    return result;
}
