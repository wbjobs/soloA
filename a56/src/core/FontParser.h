#ifndef FONTPARSER_H
#define FONTPARSER_H

#include <QString>
#include <QList>
#include <QChar>
#include <QMap>
#include <QSharedPointer>
#include <ft2build.h>
#include FT_FREETYPE_H
#include FT_KERNING_H
#include FT_TRUETYPE_TABLES_H
#include FT_SFNT_NAMES_H

#include "core/KerningPair.h"

struct FontInfo
{
    QString filePath;
    QString familyName;
    QString styleName;
    int unitsPerEm;
    int ascender;
    int descender;
    int lineGap;
    QList<ushort> glyphs;
    QMap<QChar, ushort> charToGlyph;
    QMap<ushort, QChar> glyphToChar;
    QList<KerningPair> kerningPairs;
};

class FontParser
{
public:
    FontParser();
    ~FontParser();

    bool initialize();
    void cleanup();

    QSharedPointer<FontInfo> parseFont(const QString& filePath);
    bool hasKerning() const;
    QString lastError() const;

private:
    bool parseCharacterMap(FT_Face face, QSharedPointer<FontInfo> info);
    bool parseKerning(FT_Face face, QSharedPointer<FontInfo> info);
    bool parseFontInfo(FT_Face face, QSharedPointer<FontInfo> info);

    FT_Library m_library;
    bool m_initialized;
    QString m_lastError;
};

#endif
