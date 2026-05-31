#ifndef PREVIEWRENDERER_H
#define PREVIEWRENDERER_H

#include <QObject>
#include <QImage>
#include <QString>
#include <QColor>
#include <QSize>
#include <QSharedPointer>

#include "render/FontRenderer.h"
#include "core/KerningAdjuster.h"

class PreviewRenderer : public QObject
{
    Q_OBJECT
public:
    enum class Mode {
        SideBySide,
        Overlay,
        Difference
    };

    explicit PreviewRenderer(QObject* parent = nullptr);
    ~PreviewRenderer();

    void setAdjuster(KerningAdjuster* adjuster);

    void setPreviewText(const QString& text);
    QString previewText() const;

    void setFontSize(int size);
    int fontSize() const;

    void setMode(Mode mode);
    Mode mode() const;

    QImage renderPreview();

    QImage renderOriginal();
    QImage renderAdjusted();

    QSize calculateSize() const;

signals:
    void previewChanged();

private:
    KerningAdjuster* m_adjuster;
    FontRenderer* m_renderer;
    QString m_previewText;
    int m_fontSize;
    Mode m_mode;

    QMap<QString, int> buildCustomKerningMap() const;
    QImage renderOverlay();
    QImage renderDifference();
};

#endif
