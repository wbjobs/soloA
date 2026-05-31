#ifndef KERNINGADJUSTER_H
#define KERNINGADJUSTER_H

#include <QObject>
#include <QList>
#include <QMap>
#include <QString>
#include <QSharedPointer>

#include "core/FontParser.h"
#include "core/KerningPair.h"
#include "core/HistoryManager.h"

class KerningAdjuster : public QObject
{
    Q_OBJECT
public:
    explicit KerningAdjuster(QObject* parent = nullptr);
    ~KerningAdjuster();

    void setFontInfo(QSharedPointer<FontInfo> info);
    QSharedPointer<FontInfo> fontInfo() const;

    QList<KerningPair> kerningPairs() const;
    QList<KerningPair> modifiedPairs() const;

    void setKerningValue(QChar left, QChar right, int value);
    void setKerningValue(const KerningPair& pair);

    void adjustKerning(QChar left, QChar right, int delta);
    void adjustKerning(const KerningPair& pair, int delta);

    void batchAdjust(int delta);
    void batchAdjust(const QList<KerningPair>& pairs, int delta);

    void resetAll();
    void resetPair(QChar left, QChar right);

    void addKerningPair(QChar left, QChar right, int value);
    void removeKerningPair(QChar left, QChar right);

    int kerningValue(QChar left, QChar right) const;
    int originalKerningValue(QChar left, QChar right) const;
    bool hasKerningPair(QChar left, QChar right) const;

    bool canUndo() const;
    bool canRedo() const;

    HistoryManager* historyManager() const;

public slots:
    void undo();
    void redo();

signals:
    void kerningChanged(const QList<KerningPair>& pairs);
    void pairModified(const KerningPair& pair);

private:
    int findPairIndex(QChar left, QChar right) const;
    void applyHistoryItem(const HistoryItem& item);

    QSharedPointer<FontInfo> m_fontInfo;
    HistoryManager* m_historyManager;
};

#endif
