#ifndef FONTRENDERER_H
#define FONTRENDERER_H

#include <QObject>
#include <QImage>
#include <QString>
#include <QColor>
#include <QMap>
#include <QSharedPointer>

#include <ft2build.h>
#include FT_FREETYPE_H

#include "core/FontParser.h"

struct GlyphInfo
{
    ushort glyphIndex;
    QChar character;
    int advanceX;
    int width;
    int height;
    int bearingX;
    int bearingY;
    QImage bitmap;
};

class FontRenderer : public QObject
{
    Q_OBJECT
public:
    explicit FontRenderer(QObject* parent = nullptr);
    ~FontRenderer();

    bool initialize();
    void cleanup();

    bool loadFont(const QString& filePath, int fontSize = 48);
    void setFontSize(int fontSize);
    int fontSize() const;

    QImage renderText(const QString& text, const QColor& color = Qt::black,
                       bool applyKerning = true, const QMap<QString, int>& customKerning = {});

    QImage renderCharacter(QChar ch, const QColor& color = Qt::black);

    int textWidth(const QString& text, bool applyKerning = true,
                  const QMap<QString, int>& customKerning = {});

    int ascent() const;
    int descent() const;
    int lineHeight() const;

    QString lastError() const;

private:
    FT_Library m_library;
    FT_Face m_face;
    int m_fontSize;
    bool m_initialized;
    bool m_faceLoaded;
    QString m_lastError;
    QString m_currentFontPath;

    bool ensureFaceLoaded();
    QImage glyphToImage(FT_GlyphSlot slot, const QColor& color);
};

#endif
