#include "render/FontRenderer.h"
#include <QPainter>
#include <QDebug>

FontRenderer::FontRenderer(QObject* parent)
    : QObject(parent)
    , m_library(nullptr)
    , m_face(nullptr)
    , m_fontSize(48)
    , m_initialized(false)
    , m_faceLoaded(false)
{
}

FontRenderer::~FontRenderer()
{
    cleanup();
}

bool FontRenderer::initialize()
{
    if (m_initialized) {
        return true;
    }

    FT_Error error = FT_Init_FreeType(&m_library);
    if (error != 0) {
        m_lastError = QStringLiteral("无法初始化 FreeType 库");
        return false;
    }

    m_initialized = true;
    return true;
}

void FontRenderer::cleanup()
{
    if (m_face && m_faceLoaded) {
        FT_Done_Face(m_face);
        m_face = nullptr;
        m_faceLoaded = false;
    }

    if (m_library && m_initialized) {
        FT_Done_FreeType(m_library);
        m_library = nullptr;
        m_initialized = false;
    }
}

bool FontRenderer::loadFont(const QString& filePath, int fontSize)
{
    if (!initialize()) {
        return false;
    }

    if (m_faceLoaded && m_currentFontPath == filePath && m_fontSize == fontSize) {
        return true;
    }

    if (m_faceLoaded) {
        FT_Done_Face(m_face);
        m_face = nullptr;
        m_faceLoaded = false;
    }

    FT_Error error = FT_New_Face(m_library, filePath.toStdString().c_str(), 0, &m_face);
    if (error != 0) {
        m_lastError = QStringLiteral("无法加载字体文件: %1").arg(filePath);
        return false;
    }

    error = FT_Set_Pixel_Sizes(m_face, 0, fontSize);
    if (error != 0) {
        m_lastError = QStringLiteral("无法设置字体大小");
        FT_Done_Face(m_face);
        return false;
    }

    m_currentFontPath = filePath;
    m_fontSize = fontSize;
    m_faceLoaded = true;
    return true;
}

void FontRenderer::setFontSize(int fontSize)
{
    if (m_fontSize == fontSize) return;

    m_fontSize = fontSize;
    if (m_faceLoaded) {
        FT_Set_Pixel_Sizes(m_face, 0, fontSize);
    }
}

int FontRenderer::fontSize() const
{
    return m_fontSize;
}

QImage FontRenderer::renderText(const QString& text, const QColor& color,
                                bool applyKerning, const QMap<QString, int>& customKerning)
{
    if (!ensureFaceLoaded() || text.isEmpty()) {
        return QImage();
    }

    int totalWidth = textWidth(text, applyKerning, customKerning);
    int asc = ascent();
    int desc = descent();
    int height = asc + qAbs(desc) + 20;

    int devicePixelRatio = 2;
    int scaledWidth = (totalWidth + 40) * devicePixelRatio;
    int scaledHeight = height * devicePixelRatio;

    QImage image(scaledWidth, scaledHeight, QImage::Format_ARGB32_Premultiplied);
    image.setDevicePixelRatio(devicePixelRatio);
    image.fill(Qt::transparent);

    QPainter painter(&image);
    painter.setRenderHint(QPainter::Antialiasing);
    painter.setRenderHint(QPainter::SmoothPixmapTransform);
    painter.setRenderHint(QPainter::HighQualityAntialiasing);
    painter.scale(devicePixelRatio, devicePixelRatio);

    int penX = 20;
    FT_UInt prevGlyphIndex = 0;

    for (int i = 0; i < text.length(); ++i) {
        QChar ch = text[i];
        FT_UInt glyphIndex = FT_Get_Char_Index(m_face, ch.unicode());

        if (applyKerning && prevGlyphIndex != 0 && glyphIndex != 0) {
            FT_Vector kerning;
            if (FT_Get_Kerning(m_face, prevGlyphIndex, glyphIndex, FT_KERNING_DEFAULT, &kerning) == 0) {
                penX += kerning.x >> 6;
            }
        }

        QString pairKey;
        if (i > 0) {
            pairKey = QStringLiteral("%1%2").arg(text[i-1]).arg(ch);
        }
        if (customKerning.contains(pairKey)) {
            penX += customKerning[pairKey];
        }

        FT_Int32 loadFlags = FT_LOAD_DEFAULT | FT_LOAD_FORCE_AUTOHINT;
        if (FT_Load_Glyph(m_face, glyphIndex, loadFlags) == 0) {
            FT_Render_Mode renderMode = FT_RENDER_MODE_NORMAL;
            if (FT_Render_Glyph(m_face->glyph, renderMode) == 0) {
                FT_GlyphSlot slot = m_face->glyph;
                QImage glyphImage = glyphToImage(slot, color);

                if (!glyphImage.isNull()) {
                    int x = penX + slot->bitmap_left;
                    int y = asc - slot->bitmap_top + 10;
                    painter.drawImage(x, y, glyphImage);
                }

                penX += slot->advance.x >> 6;
            }
        }

        prevGlyphIndex = glyphIndex;
    }

    painter.end();
    return image;
}

QImage FontRenderer::renderCharacter(QChar ch, const QColor& color)
{
    if (!ensureFaceLoaded()) {
        return QImage();
    }

    FT_UInt glyphIndex = FT_Get_Char_Index(m_face, ch.unicode());
    if (glyphIndex == 0) {
        return QImage();
    }

    FT_Int32 loadFlags = FT_LOAD_DEFAULT | FT_LOAD_FORCE_AUTOHINT;
    if (FT_Load_Glyph(m_face, glyphIndex, loadFlags) != 0) {
        return QImage();
    }

    if (FT_Render_Glyph(m_face->glyph, FT_RENDER_MODE_NORMAL) != 0) {
        return QImage();
    }

    return glyphToImage(m_face->glyph, color);
}

int FontRenderer::textWidth(const QString& text, bool applyKerning,
                            const QMap<QString, int>& customKerning)
{
    if (!ensureFaceLoaded() || text.isEmpty()) {
        return 0;
    }

    int width = 0;
    FT_UInt prevGlyphIndex = 0;

    for (int i = 0; i < text.length(); ++i) {
        QChar ch = text[i];
        FT_UInt glyphIndex = FT_Get_Char_Index(m_face, ch.unicode());

        if (applyKerning && prevGlyphIndex != 0 && glyphIndex != 0) {
            FT_Vector kerning;
            if (FT_Get_Kerning(m_face, prevGlyphIndex, glyphIndex, FT_KERNING_DEFAULT, &kerning) == 0) {
                width += kerning.x >> 6;
            }
        }

        QString pairKey;
        if (i > 0) {
            pairKey = QStringLiteral("%1%2").arg(text[i-1]).arg(ch);
        }
        if (customKerning.contains(pairKey)) {
            width += customKerning[pairKey];
        }

        FT_Int32 loadFlags = FT_LOAD_DEFAULT | FT_LOAD_FORCE_AUTOHINT;
        if (FT_Load_Glyph(m_face, glyphIndex, loadFlags) == 0) {
            width += m_face->glyph->advance.x >> 6;
        }

        prevGlyphIndex = glyphIndex;
    }

    return width;
}

int FontRenderer::ascent() const
{
    if (!m_faceLoaded) return 0;
    return m_face->size->metrics.ascender >> 6;
}

int FontRenderer::descent() const
{
    if (!m_faceLoaded) return 0;
    return m_face->size->metrics.descender >> 6;
}

int FontRenderer::lineHeight() const
{
    if (!m_faceLoaded) return 0;
    return m_face->size->metrics.height >> 6;
}

QString FontRenderer::lastError() const
{
    return m_lastError;
}

bool FontRenderer::ensureFaceLoaded()
{
    return initialize() && m_faceLoaded;
}

QImage FontRenderer::glyphToImage(FT_GlyphSlot slot, const QColor& color)
{
    FT_Bitmap* bitmap = &slot->bitmap;
    int width = bitmap->width;
    int height = bitmap->rows;

    if (width == 0 || height == 0) {
        return QImage();
    }

    QImage image(width, height, QImage::Format_ARGB32_Premultiplied);
    image.fill(Qt::transparent);

    for (int y = 0; y < height; ++y) {
        for (int x = 0; x < width; ++x) {
            unsigned char alpha = bitmap->buffer[y * bitmap->pitch + x];
            if (alpha > 0) {
                QColor pixel = color;
                pixel.setAlpha(alpha);
                image.setPixel(x, y, pixel.rgba());
            }
        }
    }

    return image;
}
