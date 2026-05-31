#include "core/FontManager.h"
#include <QDir>
#include <QFileInfo>
#include <QDebug>

FontManager::FontManager(QObject* parent)
    : QObject(parent)
{
    m_parser.initialize();
}

FontManager::~FontManager()
{
    m_parser.cleanup();
}

bool FontManager::loadFont(const QString& filePath)
{
    QFileInfo fileInfo(filePath);
    if (!fileInfo.exists()) {
        qWarning() << "字体文件不存在:" << filePath;
        return false;
    }

    QString canonicalPath = fileInfo.canonicalFilePath();
    if (m_fonts.contains(canonicalPath)) {
        qWarning() << "字体已加载:" << filePath;
        return true;
    }

    auto fontInfo = m_parser.parseFont(filePath);
    if (!fontInfo) {
        qWarning() << "无法解析字体:" << filePath << m_parser.lastError();
        return false;
    }

    m_fonts.insert(canonicalPath, fontInfo);
    emit fontLoaded(canonicalPath);
    emit fontsChanged();
    return true;
}

bool FontManager::loadFontsFromDirectory(const QString& directoryPath)
{
    QDir dir(directoryPath);
    if (!dir.exists()) {
        qWarning() << "目录不存在:" << directoryPath;
        return false;
    }

    QStringList filters;
    filters << "*.ttf" << "*.otf" << "*.TTF" << "*.OTF";
    dir.setNameFilters(filters);

    QFileInfoList entries = dir.entryInfoList(QDir::Files);
    int loaded = 0;

    for (const QFileInfo& entry : entries) {
        if (loadFont(entry.canonicalFilePath())) {
            ++loaded;
        }
    }

    return loaded > 0;
}

void FontManager::unloadFont(const QString& filePath)
{
    QFileInfo fileInfo(filePath);
    QString canonicalPath = fileInfo.canonicalFilePath();

    if (m_fonts.remove(canonicalPath) > 0) {
        emit fontUnloaded(canonicalPath);
        emit fontsChanged();
    }
}

void FontManager::unloadAllFonts()
{
    m_fonts.clear();
    emit fontsChanged();
}

QList<QSharedPointer<FontInfo>> FontManager::fonts() const
{
    return m_fonts.values();
}

QSharedPointer<FontInfo> FontManager::font(const QString& filePath) const
{
    QFileInfo fileInfo(filePath);
    QString canonicalPath = fileInfo.canonicalFilePath();
    return m_fonts.value(canonicalPath, nullptr);
}

QStringList FontManager::fontPaths() const
{
    return m_fonts.keys();
}

int FontManager::fontCount() const
{
    return m_fonts.size();
}

bool FontManager::hasFont(const QString& filePath) const
{
    QFileInfo fileInfo(filePath);
    QString canonicalPath = fileInfo.canonicalFilePath();
    return m_fonts.contains(canonicalPath);
}
