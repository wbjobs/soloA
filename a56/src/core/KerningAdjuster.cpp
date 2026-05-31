#include "core/KerningAdjuster.h"
#include <QDebug>

KerningAdjuster::KerningAdjuster(QObject* parent)
    : QObject(parent)
    , m_fontInfo(nullptr)
    , m_historyManager(new HistoryManager(this))
{
}

KerningAdjuster::~KerningAdjuster()
{
}

void KerningAdjuster::setFontInfo(QSharedPointer<FontInfo> info)
{
    m_fontInfo = info;
    m_historyManager->clear();
    emit kerningChanged(kerningPairs());
}

QSharedPointer<FontInfo> KerningAdjuster::fontInfo() const
{
    return m_fontInfo;
}

QList<KerningPair> KerningAdjuster::kerningPairs() const
{
    if (!m_fontInfo) {
        return QList<KerningPair>();
    }
    return m_fontInfo->kerningPairs;
}

QList<KerningPair> KerningAdjuster::modifiedPairs() const
{
    QList<KerningPair> modified;
    if (!m_fontInfo) {
        return modified;
    }

    for (const KerningPair& pair : m_fontInfo->kerningPairs) {
        if (pair.isModified()) {
            modified.append(pair);
        }
    }
    return modified;
}

void KerningAdjuster::setKerningValue(QChar left, QChar right, int value)
{
    if (!m_fontInfo) return;

    int index = findPairIndex(left, right);
    if (index < 0) return;

    KerningPair& pair = m_fontInfo->kerningPairs[index];
    if (pair.value() == value) return;

    HistoryItem item;
    item.type = HistoryItem::Type::ChangeKerning;
    item.fontPath = m_fontInfo->filePath;
    item.beforePairs.append(pair);
    item.description = QStringLiteral("更改字距 %1%2: %3 → %4")
        .arg(left).arg(right).arg(pair.value()).arg(value);

    pair.setValue(value);
    item.afterPairs.append(pair);

    m_historyManager->push(item);
    emit pairModified(pair);
    emit kerningChanged(kerningPairs());
}

void KerningAdjuster::setKerningValue(const KerningPair& pair)
{
    setKerningValue(pair.leftChar(), pair.rightChar(), pair.value());
}

void KerningAdjuster::adjustKerning(QChar left, QChar right, int delta)
{
    if (delta == 0) return;

    int currentValue = kerningValue(left, right);
    setKerningValue(left, right, currentValue + delta);
}

void KerningAdjuster::adjustKerning(const KerningPair& pair, int delta)
{
    adjustKerning(pair.leftChar(), pair.rightChar(), delta);
}

void KerningAdjuster::batchAdjust(int delta)
{
    if (!m_fontInfo || delta == 0) return;

    HistoryItem item;
    item.type = HistoryItem::Type::BatchAdjust;
    item.fontPath = m_fontInfo->filePath;
    item.description = QStringLiteral("批量调整所有字距 %1").arg(delta > 0 ? "+" : "").arg(delta);

    for (KerningPair& pair : m_fontInfo->kerningPairs) {
        item.beforePairs.append(pair);
        pair.setValue(pair.value() + delta);
        item.afterPairs.append(pair);
    }

    m_historyManager->push(item);
    emit kerningChanged(kerningPairs());
}

void KerningAdjuster::batchAdjust(const QList<KerningPair>& pairs, int delta)
{
    if (!m_fontInfo || delta == 0 || pairs.isEmpty()) return;

    HistoryItem item;
    item.type = HistoryItem::Type::BatchAdjust;
    item.fontPath = m_fontInfo->filePath;
    item.description = QStringLiteral("批量调整 %1 个字符对字距 %2")
        .arg(pairs.size()).arg(delta > 0 ? "+" : "").arg(delta);

    for (const KerningPair& target : pairs) {
        int index = findPairIndex(target.leftChar(), target.rightChar());
        if (index >= 0) {
            KerningPair& pair = m_fontInfo->kerningPairs[index];
            item.beforePairs.append(pair);
            pair.setValue(pair.value() + delta);
            item.afterPairs.append(pair);
        }
    }

    if (!item.beforePairs.isEmpty()) {
        m_historyManager->push(item);
        emit kerningChanged(kerningPairs());
    }
}

void KerningAdjuster::resetAll()
{
    if (!m_fontInfo) return;

    QList<KerningPair> modified = modifiedPairs();
    if (modified.isEmpty()) return;

    HistoryItem item;
    item.type = HistoryItem::Type::ResetAll;
    item.fontPath = m_fontInfo->filePath;
    item.description = QStringLiteral("重置所有字距");

    for (KerningPair& pair : m_fontInfo->kerningPairs) {
        if (pair.isModified()) {
            item.beforePairs.append(pair);
            pair.resetToOriginal();
            item.afterPairs.append(pair);
        }
    }

    m_historyManager->push(item);
    emit kerningChanged(kerningPairs());
}

void KerningAdjuster::resetPair(QChar left, QChar right)
{
    int index = findPairIndex(left, right);
    if (index < 0) return;

    KerningPair& pair = m_fontInfo->kerningPairs[index];
    if (!pair.isModified()) return;

    int original = pair.originalValue();
    setKerningValue(left, right, original);
}

void KerningAdjuster::addKerningPair(QChar left, QChar right, int value)
{
    if (!m_fontInfo) return;

    if (hasKerningPair(left, right)) {
        setKerningValue(left, right, value);
        return;
    }

    KerningPair newPair(left, right, value);
    m_fontInfo->kerningPairs.append(newPair);

    HistoryItem item;
    item.type = HistoryItem::Type::AddPair;
    item.fontPath = m_fontInfo->filePath;
    item.afterPairs.append(newPair);
    item.description = QStringLiteral("添加字距对 %1%2: %3").arg(left).arg(right).arg(value);

    m_historyManager->push(item);
    emit pairModified(newPair);
    emit kerningChanged(kerningPairs());
}

void KerningAdjuster::removeKerningPair(QChar left, QChar right)
{
    if (!m_fontInfo) return;

    int index = findPairIndex(left, right);
    if (index < 0) return;

    KerningPair pair = m_fontInfo->kerningPairs[index];
    m_fontInfo->kerningPairs.removeAt(index);

    HistoryItem item;
    item.type = HistoryItem::Type::RemovePair;
    item.fontPath = m_fontInfo->filePath;
    item.beforePairs.append(pair);
    item.description = QStringLiteral("删除字距对 %1%2").arg(left).arg(right);

    m_historyManager->push(item);
    emit kerningChanged(kerningPairs());
}

int KerningAdjuster::kerningValue(QChar left, QChar right) const
{
    int index = findPairIndex(left, right);
    if (index < 0) return 0;
    return m_fontInfo->kerningPairs[index].value();
}

int KerningAdjuster::originalKerningValue(QChar left, QChar right) const
{
    int index = findPairIndex(left, right);
    if (index < 0) return 0;
    return m_fontInfo->kerningPairs[index].originalValue();
}

bool KerningAdjuster::hasKerningPair(QChar left, QChar right) const
{
    return findPairIndex(left, right) >= 0;
}

bool KerningAdjuster::canUndo() const
{
    return m_historyManager->canUndo();
}

bool KerningAdjuster::canRedo() const
{
    return m_historyManager->canRedo();
}

HistoryManager* KerningAdjuster::historyManager() const
{
    return m_historyManager;
}

void KerningAdjuster::undo()
{
    if (!m_historyManager->canUndo()) return;

    HistoryItem item = m_historyManager->undo();
    applyHistoryItem(item);
}

void KerningAdjuster::redo()
{
    if (!m_historyManager->canRedo()) return;

    HistoryItem item = m_historyManager->redo();
    applyHistoryItem(item);
}

int KerningAdjuster::findPairIndex(QChar left, QChar right) const
{
    if (!m_fontInfo) return -1;

    for (int i = 0; i < m_fontInfo->kerningPairs.size(); ++i) {
        const KerningPair& pair = m_fontInfo->kerningPairs[i];
        if (pair.leftChar() == left && pair.rightChar() == right) {
            return i;
        }
    }
    return -1;
}

void KerningAdjuster::applyHistoryItem(const HistoryItem& item)
{
    if (!m_fontInfo) return;

    for (const KerningPair& pair : item.beforePairs) {
        int index = findPairIndex(pair.leftChar(), pair.rightChar());
        if (index >= 0) {
            m_fontInfo->kerningPairs[index] = pair;
        }
    }

    emit kerningChanged(kerningPairs());
}
