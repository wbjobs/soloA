#ifndef FONTMANAGER_H
#define FONTMANAGER_H

#include <QObject>
#include <QList>
#include <QMap>
#include <QSharedPointer>
#include <QString>

#include "core/FontParser.h"

class FontManager : public QObject
{
    Q_OBJECT
public:
    explicit FontManager(QObject* parent = nullptr);
    ~FontManager();

    bool loadFont(const QString& filePath);
    bool loadFontsFromDirectory(const QString& directoryPath);
    void unloadFont(const QString& filePath);
    void unloadAllFonts();

    QList<QSharedPointer<FontInfo>> fonts() const;
    QSharedPointer<FontInfo> font(const QString& filePath) const;
    QStringList fontPaths() const;

    int fontCount() const;
    bool hasFont(const QString& filePath) const;

signals:
    void fontLoaded(const QString& filePath);
    void fontUnloaded(const QString& filePath);
    void fontsChanged();

private:
    QMap<QString, QSharedPointer<FontInfo>> m_fonts;
    FontParser m_parser;
};

#endif
