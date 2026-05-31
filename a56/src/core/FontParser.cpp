#include "core/FontParser.h"
#include <QFileInfo>
#include <QDebug>

FontParser::FontParser()
    : m_library(nullptr)
    , m_initialized(false)
{
}

FontParser::~FontParser()
{
    cleanup();
}

bool FontParser::initialize()
{
    if (m_initialized) {
        return true;
    }

    FT_Error error = FT_Init_FreeType(&m_library);
    if (error != 0) {
        m_lastError = QStringLiteral("无法初始化 FreeType 库，错误代码: %1").arg(error);
        return false;
    }

    m_initialized = true;
    return true;
}

void FontParser::cleanup()
{
    if (m_library && m_initialized) {
        FT_Done_FreeType(m_library);
        m_library = nullptr;
        m_initialized = false;
    }
}

QSharedPointer<FontInfo> FontParser::parseFont(const QString& filePath)
{
    if (!initialize()) {
        return nullptr;
    }

    QFileInfo fileInfo(filePath);
    if (!fileInfo.exists()) {
        m_lastError = QStringLiteral("字体文件不存在: %1").arg(filePath);
        return nullptr;
    }

    FT_Face face = nullptr;
    FT_Error error = FT_New_Face(
        m_library,
        filePath.toStdString().c_str(),
        0,
        &face
    );

    if (error != 0) {
        m_lastError = QStringLiteral("无法加载字体: %1，错误代码: %2").arg(filePath).arg(error);
        return nullptr;
    }

    QSharedPointer<FontInfo> info(new FontInfo);
    info->filePath = filePath;

    if (!parseFontInfo(face, info)) {
        FT_Done_Face(face);
        return nullptr;
    }

    if (!parseCharacterMap(face, info)) {
        FT_Done_Face(face);
        return nullptr;
    }

    parseKerning(face, info);

    FT_Done_Face(face);
    return info;
}

bool FontParser::hasKerning() const
{
    return FT_HAS_KERNING(m_library);
}

QString FontParser::lastError() const
{
    return m_lastError;
}

bool FontParser::parseFontInfo(FT_Face face, QSharedPointer<FontInfo> info)
{
    if (face->family_name) {
        info->familyName = QString::fromUtf8(face->family_name);
    } else {
        info->familyName = QStringLiteral("Unknown");
    }

    if (face->style_name) {
        info->styleName = QString::fromUtf8(face->style_name);
    } else {
        info->styleName = QStringLiteral("Regular");
    }

    info->unitsPerEm = face->units_per_EM;
    info->ascender = face->ascender;
    info->descender = face->descender;
    info->lineGap = face->height - (face->ascender - face->descender);

    return true;
}

bool FontParser::parseCharacterMap(FT_Face face, QSharedPointer<FontInfo> info)
{
    if (FT_Select_Charmap(face, FT_ENCODING_UNICODE) != 0) {
        m_lastError = QStringLiteral("字体不支持 Unicode 编码");
        return false;
    }

    FT_UInt glyphIndex;
    FT_ULong charCode = FT_Get_First_Char(face, &glyphIndex);

    while (glyphIndex != 0) {
        QChar ch = QChar(charCode);
        info->glyphs.append(glyphIndex);
        info->charToGlyph.insert(ch, glyphIndex);
        info->glyphToChar.insert(glyphIndex, ch);
        charCode = FT_Get_Next_Char(face, charCode, &glyphIndex);
    }

    return true;
}

bool FontParser::parseKerning(FT_Face face, QSharedPointer<FontInfo> info)
{
    bool hasTraditionalKerning = FT_HAS_KERNING(face);
    bool hasGPOS = false;

    FT_ULong tableSize = 0;
    FT_Error error = FT_Load_Sfnt_Table(face, FT_MAKE_TAG('G', 'P', 'O', 'S'), 0, nullptr, &tableSize);
    hasGPOS = (error == 0 && tableSize > 0);

    if (!hasTraditionalKerning && !hasGPOS) {
        return true;
    }

    QList<ushort> glyphs = info->glyphs;
    int total = glyphs.size();
    int foundPairs = 0;

    if (hasTraditionalKerning) {
        for (int i = 0; i < total && foundPairs < 10000; ++i) {
            ushort leftGlyph = glyphs[i];
            for (int j = 0; j < total && foundPairs < 10000; ++j) {
                if (i == j) continue;

                ushort rightGlyph = glyphs[j];
                FT_Vector kerning;

                error = FT_Get_Kerning(face, leftGlyph, rightGlyph, FT_KERNING_UNSCALED, &kerning);
                if (error == 0 && kerning.x != 0) {
                    QChar left = info->glyphToChar.value(leftGlyph, QChar::Null);
                    QChar right = info->glyphToChar.value(rightGlyph, QChar::Null);

                    if (!left.isNull() && !right.isNull()) {
                        bool found = false;
                        for (const KerningPair& existing : info->kerningPairs) {
                            if (existing.leftChar() == left && existing.rightChar() == right) {
                                found = true;
                                break;
                            }
                        }
                        if (!found) {
                            KerningPair pair(left, right, kerning.x);
                            info->kerningPairs.append(pair);
                            ++foundPairs;
                        }
                    }
                }
            }
        }
    }

    if (hasGPOS && info->kerningPairs.isEmpty()) {
        for (int i = 0; i < total && foundPairs < 5000; ++i) {
            ushort leftGlyph = glyphs[i];
            for (int j = 0; j < total && foundPairs < 5000; ++j) {
                if (i == j) continue;

                ushort rightGlyph = glyphs[j];
                FT_Vector kerning;

                error = FT_Get_Kerning(face, leftGlyph, rightGlyph, FT_KERNING_UNSCALED, &kerning);
                if (error == 0 && kerning.x != 0) {
                    QChar left = info->glyphToChar.value(leftGlyph, QChar::Null);
                    QChar right = info->glyphToChar.value(rightGlyph, QChar::Null);

                    if (!left.isNull() && !right.isNull()) {
                        bool found = false;
                        for (const KerningPair& existing : info->kerningPairs) {
                            if (existing.leftChar() == left && existing.rightChar() == right) {
                                found = true;
                                break;
                            }
                        }
                        if (!found) {
                            KerningPair pair(left, right, kerning.x);
                            info->kerningPairs.append(pair);
                            ++foundPairs;
                        }
                    }
                }
            }
        }
    }

    if (info->kerningPairs.isEmpty()) {
        for (int i = 0; i < total; ++i) {
            ushort leftGlyph = glyphs[i];
            for (int j = 0; j < total; ++j) {
                if (i == j) continue;

                ushort rightGlyph = glyphs[j];
                FT_Vector kerning;

                error = FT_Get_Kerning(face, leftGlyph, rightGlyph, FT_KERNING_UNSCALED, &kerning);
                if (error == 0 && kerning.x != 0) {
                    QChar left = info->glyphToChar.value(leftGlyph, QChar::Null);
                    QChar right = info->glyphToChar.value(rightGlyph, QChar::Null);

                    if (!left.isNull() && !right.isNull()) {
                        bool found = false;
                        for (const KerningPair& existing : info->kerningPairs) {
                            if (existing.leftChar() == left && existing.rightChar() == right) {
                                found = true;
                                break;
                            }
                        }
                        if (!found) {
                            KerningPair pair(left, right, kerning.x);
                            info->kerningPairs.append(pair);
                        }
                    }
                }
            }
        }
    }

    return true;
}
