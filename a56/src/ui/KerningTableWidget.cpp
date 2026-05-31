#include "ui/KerningTableWidget.h"
#include <QHeaderView>
#include <QInputDialog>
#include <QColor>
#include <QBrush>
#include <QMessageBox>

KerningTableWidget::KerningTableWidget(KerningAdjuster* adjuster, QWidget* parent)
    : QWidget(parent)
    , m_adjuster(adjuster)
    , m_internalUpdate(false)
{
    setupUI();
    setAdjuster(adjuster);
}

KerningTableWidget::~KerningTableWidget()
{
}

void KerningTableWidget::setAdjuster(KerningAdjuster* adjuster)
{
    if (m_adjuster) {
        disconnect(m_adjuster, &KerningAdjuster::kerningChanged,
                   this, &KerningTableWidget::onKerningChanged);
    }

    m_adjuster = adjuster;

    if (m_adjuster) {
        connect(m_adjuster, &KerningAdjuster::kerningChanged,
                this, &KerningTableWidget::onKerningChanged);
    }

    refresh();
}

void KerningTableWidget::refresh()
{
    if (m_adjuster && m_adjuster->fontInfo()) {
        m_allPairs = m_adjuster->kerningPairs();
    } else {
        m_allPairs.clear();
    }
    updateTable();
}

QList<KerningPair> KerningTableWidget::selectedPairs() const
{
    QList<KerningPair> selected;
    QList<QTableWidgetItem*> items = m_tableWidget->selectedItems();
    QSet<int> rows;

    for (QTableWidgetItem* item : items) {
        rows.insert(item->row());
    }

    for (int row : rows) {
        if (row >= 0 && row < m_tableWidget->rowCount()) {
            QVariant data = m_tableWidget->item(row, 0)->data(Qt::UserRole);
            if (data.canConvert<KerningPair>()) {
                selected.append(data.value<KerningPair>());
            }
        }
    }

    return selected;
}

void KerningTableWidget::setupUI()
{
    QVBoxLayout* mainLayout = new QVBoxLayout(this);
    mainLayout->setContentsMargins(5, 5, 5, 5);

    QHBoxLayout* filterLayout = new QHBoxLayout();
    m_filterEdit = new QLineEdit(this);
    m_filterEdit->setPlaceholderText(tr("搜索字符对..."));
    filterLayout->addWidget(new QLabel(tr("筛选:"), this));
    filterLayout->addWidget(m_filterEdit);

    m_showModifiedOnlyCheck = new QCheckBox(tr("只显示修改项"), this);
    filterLayout->addWidget(m_showModifiedOnlyCheck);
    filterLayout->addStretch();

    mainLayout->addLayout(filterLayout);

    m_tableWidget = new QTableWidget(this);
    m_tableWidget->setColumnCount(ColCount);
    m_tableWidget->setHorizontalHeaderLabels({
        tr("左字符"),
        tr("右字符"),
        tr("原始值"),
        tr("当前值"),
        tr("变化量")
    });
    m_tableWidget->setSelectionBehavior(QAbstractItemView::SelectRows);
    m_tableWidget->setSelectionMode(QAbstractItemView::ExtendedSelection);
    m_tableWidget->setAlternatingRowColors(true);
    m_tableWidget->horizontalHeader()->setStretchLastSection(true);
    m_tableWidget->verticalHeader()->setDefaultSectionSize(25);

    mainLayout->addWidget(m_tableWidget);

    QHBoxLayout* toolbarLayout = new QHBoxLayout();

    m_addBtn = new QPushButton(tr("添加"), this);
    toolbarLayout->addWidget(m_addBtn);

    m_removeBtn = new QPushButton(tr("删除"), this);
    toolbarLayout->addWidget(m_removeBtn);

    toolbarLayout->addSeparator();

    m_adjustAmountSpin = new QSpinBox(this);
    m_adjustAmountSpin->setRange(-1000, 1000);
    m_adjustAmountSpin->setValue(10);
    toolbarLayout->addWidget(new QLabel(tr("调整量:"), this));
    toolbarLayout->addWidget(m_adjustAmountSpin);

    QPushButton* minusBtn = new QPushButton(tr("-"), this);
    minusBtn->setFixedWidth(40);
    toolbarLayout->addWidget(minusBtn);

    QPushButton* plusBtn = new QPushButton(tr("+"), this);
    plusBtn->setFixedWidth(40);
    toolbarLayout->addWidget(plusBtn);

    toolbarLayout->addSeparator();

    m_resetBtn = new QPushButton(tr("重置选中"), this);
    toolbarLayout->addWidget(m_resetBtn);

    toolbarLayout->addStretch();

    mainLayout->addLayout(toolbarLayout);

    connect(m_filterEdit, &QLineEdit::textChanged,
            this, &KerningTableWidget::onFilterChanged);
    connect(m_showModifiedOnlyCheck, &QCheckBox::toggled,
            this, &KerningTableWidget::onShowModifiedOnlyToggled);
    connect(m_tableWidget, &QTableWidget::cellChanged,
            this, &KerningTableWidget::onCellChanged);
    connect(m_tableWidget, &QTableWidget::itemSelectionChanged,
            this, &KerningTableWidget::selectionChanged);
    connect(m_addBtn, &QPushButton::clicked,
            this, &KerningTableWidget::onAddPair);
    connect(m_removeBtn, &QPushButton::clicked,
            this, &KerningTableWidget::onRemoveSelected);
    connect(m_resetBtn, &QPushButton::clicked,
            this, &KerningTableWidget::onResetSelected);
    connect(minusBtn, &QPushButton::clicked,
            this, [this]() { onAdjustValue(-m_adjustAmountSpin->value()); });
    connect(plusBtn, &QPushButton::clicked,
            this, [this]() { onAdjustValue(m_adjustAmountSpin->value()); });
}

void KerningTableWidget::updateTable()
{
    m_internalUpdate = true;
    m_tableWidget->clearContents();

    QString filter = m_filterEdit->text().trimmed();
    bool showModifiedOnly = m_showModifiedOnlyCheck->isChecked();

    QList<KerningPair> displayPairs;
    for (const KerningPair& pair : m_allPairs) {
        bool matches = pairMatchesFilter(pair, filter);
        bool showModified = !showModifiedOnly || pair.isModified();
        if (matches && showModified) {
            displayPairs.append(pair);
        }
    }

    m_tableWidget->setRowCount(displayPairs.size());

    for (int i = 0; i < displayPairs.size(); ++i) {
        addPairToTable(displayPairs[i], i);
    }

    m_tableWidget->sortByColumn(ColLeftChar, Qt::AscendingOrder);
    m_internalUpdate = false;
}

void KerningTableWidget::addPairToTable(const KerningPair& pair, int row)
{
    QVariant variant;
    variant.setValue(pair);

    QTableWidgetItem* leftItem = new QTableWidgetItem(QString(pair.leftChar()));
    leftItem->setData(Qt::UserRole, variant);
    leftItem->setFlags(leftItem->flags() & ~Qt::ItemIsEditable);
    m_tableWidget->setItem(row, ColLeftChar, leftItem);

    QTableWidgetItem* rightItem = new QTableWidgetItem(QString(pair.rightChar()));
    rightItem->setFlags(rightItem->flags() & ~Qt::ItemIsEditable);
    m_tableWidget->setItem(row, ColRightChar, rightItem);

    QTableWidgetItem* originalItem = new QTableWidgetItem(QString::number(pair.originalValue()));
    originalItem->setFlags(originalItem->flags() & ~Qt::ItemIsEditable);
    m_tableWidget->setItem(row, ColOriginalValue, originalItem);

    QTableWidgetItem* currentItem = new QTableWidgetItem(QString::number(pair.value()));
    m_tableWidget->setItem(row, ColCurrentValue, currentItem);

    int delta = pair.value() - pair.originalValue();
    QTableWidgetItem* deltaItem = new QTableWidgetItem(
        delta > 0 ? QString("+%1").arg(delta) : QString::number(delta)
    );
    deltaItem->setFlags(deltaItem->flags() & ~Qt::ItemIsEditable);

    if (pair.isModified()) {
        QColor bgColor(255, 240, 200);
        for (int col = 0; col < ColCount; ++col) {
            QTableWidgetItem* item = m_tableWidget->item(row, col);
            if (item) {
                item->setBackground(QBrush(bgColor));
            }
        }

        if (delta > 0) {
            deltaItem->setForeground(QBrush(QColor(0, 150, 0)));
        } else if (delta < 0) {
            deltaItem->setForeground(QBrush(QColor(200, 0, 0)));
        }
    }

    m_tableWidget->setItem(row, ColDelta, deltaItem);
}

bool KerningTableWidget::pairMatchesFilter(const KerningPair& pair, const QString& filter) const
{
    if (filter.isEmpty()) return true;

    QString pairStr = pair.pairString();
    return pairStr.contains(filter, Qt::CaseInsensitive);
}

void KerningTableWidget::onCellChanged(int row, int column)
{
    if (m_internalUpdate || column != ColCurrentValue) return;

    QTableWidgetItem* item = m_tableWidget->item(row, ColLeftChar);
    if (!item) return;

    QVariant data = item->data(Qt::UserRole);
    if (!data.canConvert<KerningPair>()) return;

    KerningPair original = data.value<KerningPair>();
    QTableWidgetItem* valueItem = m_tableWidget->item(row, ColCurrentValue);
    if (!valueItem) return;

    bool ok;
    int newValue = valueItem->text().toInt(&ok);
    if (!ok) return;

    if (m_adjuster) {
        m_adjuster->setKerningValue(original.leftChar(), original.rightChar(), newValue);
    }

    KerningPair updated = original;
    updated.setValue(newValue);
    emit pairChanged(updated);
}

void KerningTableWidget::onCellDoubleClicked(int row, int column)
{
    Q_UNUSED(row)
    Q_UNUSED(column)
}

void KerningTableWidget::onFilterChanged(const QString& text)
{
    Q_UNUSED(text)
    updateTable();
}

void KerningTableWidget::onShowModifiedOnlyToggled(bool checked)
{
    Q_UNUSED(checked)
    updateTable();
}

void KerningTableWidget::onAdjustValue(int delta)
{
    if (!m_adjuster) return;

    QList<KerningPair> selected = selectedPairs();
    if (selected.isEmpty()) {
        m_adjuster->batchAdjust(delta);
    } else {
        m_adjuster->batchAdjust(selected, delta);
    }
}

void KerningTableWidget::onResetSelected()
{
    if (!m_adjuster) return;

    QList<KerningPair> selected = selectedPairs();
    if (selected.isEmpty()) {
        m_adjuster->resetAll();
    } else {
        for (const KerningPair& pair : selected) {
            m_adjuster->resetPair(pair.leftChar(), pair.rightChar());
        }
    }
}

void KerningTableWidget::onAddPair()
{
    if (!m_adjuster) return;

    bool ok;
    QString leftStr = QInputDialog::getText(
        this,
        tr("添加字距对"),
        tr("左字符:"),
        QLineEdit::Normal,
        QString(),
        &ok
    );

    if (!ok || leftStr.isEmpty()) return;

    QString rightStr = QInputDialog::getText(
        this,
        tr("添加字距对"),
        tr("右字符:"),
        QLineEdit::Normal,
        QString(),
        &ok
    );

    if (!ok || rightStr.isEmpty()) return;

    int value = QInputDialog::getInt(
        this,
        tr("添加字距对"),
        tr("字距值:"),
        0,
        -10000,
        10000,
        1,
        &ok
    );

    if (!ok) return;

    m_adjuster->addKerningPair(leftStr[0], rightStr[0], value);
}

void KerningTableWidget::onRemoveSelected()
{
    if (!m_adjuster) return;

    QList<KerningPair> selected = selectedPairs();
    if (selected.isEmpty()) return;

    QMessageBox::StandardButton reply = QMessageBox::question(
        this,
        tr("确认删除"),
        tr("确定要删除 %1 个选中的字距对吗？").arg(selected.size()),
        QMessageBox::Yes | QMessageBox::No
    );

    if (reply == QMessageBox::Yes) {
        for (const KerningPair& pair : selected) {
            m_adjuster->removeKerningPair(pair.leftChar(), pair.rightChar());
        }
    }
}

void KerningTableWidget::onKerningChanged(const QList<KerningPair>& pairs)
{
    m_allPairs = pairs;
    updateTable();
}
