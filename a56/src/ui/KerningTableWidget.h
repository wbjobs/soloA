#ifndef KERNINGTABLEWIDGET_H
#define KERNINGTABLEWIDGET_H

#include <QWidget>
#include <QTableWidget>
#include <QVBoxLayout>
#include <QHBoxLayout>
#include <QPushButton>
#include <QLineEdit>
#include <QLabel>
#include <QSpinBox>
#include <QCheckBox>
#include <QHeaderView>

#include "core/KerningAdjuster.h"

class KerningTableWidget : public QWidget
{
    Q_OBJECT
public:
    explicit KerningTableWidget(KerningAdjuster* adjuster, QWidget* parent = nullptr);
    ~KerningTableWidget();

    void setAdjuster(KerningAdjuster* adjuster);
    void refresh();

    QList<KerningPair> selectedPairs() const;

signals:
    void pairChanged(const KerningPair& pair);
    void selectionChanged();

private slots:
    void onCellChanged(int row, int column);
    void onCellDoubleClicked(int row, int column);
    void onFilterChanged(const QString& text);
    void onShowModifiedOnlyToggled(bool checked);
    void onAdjustValue(int delta);
    void onResetSelected();
    void onAddPair();
    void onRemoveSelected();
    void onKerningChanged(const QList<KerningPair>& pairs);

private:
    enum Columns {
        ColLeftChar = 0,
        ColRightChar,
        ColOriginalValue,
        ColCurrentValue,
        ColDelta,
        ColCount
    };

    KerningAdjuster* m_adjuster;
    QTableWidget* m_tableWidget;
    QLineEdit* m_filterEdit;
    QCheckBox* m_showModifiedOnlyCheck;
    QSpinBox* m_adjustAmountSpin;
    QPushButton* m_addBtn;
    QPushButton* m_removeBtn;
    QPushButton* m_resetBtn;

    QList<KerningPair> m_allPairs;
    bool m_internalUpdate;

    void setupUI();
    void updateTable();
    void addPairToTable(const KerningPair& pair, int row);
    bool pairMatchesFilter(const KerningPair& pair, const QString& filter) const;
};

#endif
