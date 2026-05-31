#include "core/HistoryManager.h"

HistoryManager::HistoryManager(QObject* parent)
    : QObject(parent)
{
}

HistoryManager::~HistoryManager()
{
}

void HistoryManager::clear()
{
    bool hadUndo = !m_undoStack.isEmpty();
    bool hadRedo = !m_redoStack.isEmpty();

    m_undoStack.clear();
    m_redoStack.clear();

    if (hadUndo) {
        emit canUndoChanged(false);
    }
    if (hadRedo) {
        emit canRedoChanged(false);
    }
}

void HistoryManager::push(const HistoryItem& item)
{
    if (m_undoStack.size() >= MAX_HISTORY) {
        m_undoStack.removeAt(0);
    }

    m_undoStack.push(item);
    m_redoStack.clear();

    if (m_undoStack.size() == 1) {
        emit canUndoChanged(true);
    }
    emit canRedoChanged(false);
}

bool HistoryManager::canUndo() const
{
    return !m_undoStack.isEmpty();
}

bool HistoryManager::canRedo() const
{
    return !m_redoStack.isEmpty();
}

HistoryItem HistoryManager::undo()
{
    if (!canUndo()) {
        return HistoryItem();
    }

    HistoryItem item = m_undoStack.pop();
    m_redoStack.push(item);

    if (m_undoStack.isEmpty()) {
        emit canUndoChanged(false);
    }
    if (m_redoStack.size() == 1) {
        emit canRedoChanged(true);
    }

    return item;
}

HistoryItem HistoryManager::redo()
{
    if (!canRedo()) {
        return HistoryItem();
    }

    HistoryItem item = m_redoStack.pop();
    m_undoStack.push(item);

    if (m_redoStack.isEmpty()) {
        emit canRedoChanged(false);
    }
    if (m_undoStack.size() == 1) {
        emit canUndoChanged(true);
    }

    return item;
}

int HistoryManager::undoCount() const
{
    return m_undoStack.size();
}

int HistoryManager::redoCount() const
{
    return m_redoStack.size();
}
