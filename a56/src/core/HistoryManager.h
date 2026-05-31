#ifndef HISTORYMANAGER_H
#define HISTORYMANAGER_H

#include <QObject>
#include <QStack>
#include <QVariant>
#include <QList>
#include "core/KerningPair.h"

struct HistoryItem
{
    enum class Type {
        ChangeKerning,
        BatchAdjust,
        ResetAll,
        AddPair,
        RemovePair
    };

    Type type;
    QString fontPath;
    QList<KerningPair> beforePairs;
    QList<KerningPair> afterPairs;
    QString description;
};

class HistoryManager : public QObject
{
    Q_OBJECT
public:
    explicit HistoryManager(QObject* parent = nullptr);
    ~HistoryManager();

    void clear();
    void push(const HistoryItem& item);

    bool canUndo() const;
    bool canRedo() const;

    HistoryItem undo();
    HistoryItem redo();

    int undoCount() const;
    int redoCount() const;

signals:
    void canUndoChanged(bool canUndo);
    void canRedoChanged(bool canRedo);

private:
    QStack<HistoryItem> m_undoStack;
    QStack<HistoryItem> m_redoStack;
    static const int MAX_HISTORY = 50;
};

#endif
