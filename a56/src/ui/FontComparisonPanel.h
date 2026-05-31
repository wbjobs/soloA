#ifndef FONTCOMPARISONPANEL_H
#define FONTCOMPARISONPANEL_H

#include <QWidget>
#include <QVBoxLayout>
#include <QHBoxLayout>
#include <QPushButton>
#include <QComboBox>
#include <QSpinBox>
#include <QLabel>
#include <QTableWidget>
#include <QProgressBar>
#include <QCheckBox>
#include <QGroupBox>
#include <QScrollArea>
#include <QListWidget>
#include <QListWidgetItem>
#include <QFileDialog>

#include "core/FontComparisonManager.h"
#include "core/FontManager.h"
#include "core/KerningAdjuster.h"

class FontComparisonPanel : public QWidget
{
    Q_OBJECT
public:
    explicit FontComparisonPanel(FontManager* manager, QWidget* parent = nullptr);
    ~FontComparisonPanel();

    void setAdjuster(KerningAdjuster* adjuster);

signals:
    void unifiedKerningApplied(const QString& fontPath, int count);

private slots:
    void onAddFonts();
    void onRemoveSelected();
    void onClearAll();
    void onStartComparison();
    void onFindInconsistencies();
    void onApplyUnified();
    void onComparisonProgress(int current, int total);
    void onComparisonFinished(const QList<ComparisonReport>& reports);
    void onReportSelected(QListWidgetItem* item);

private:
    FontManager* m_fontManager;
    KerningAdjuster* m_adjuster;
    FontComparisonManager* m_comparisonManager;

    QListWidget* m_fontListWidget;
    QPushButton* m_addFontsBtn;
    QPushButton* m_removeBtn;
    QPushButton* m_clearBtn;
    QSpinBox* m_previewSizeSpin;
    QSpinBox* m_thresholdSpin;
    QPushButton* m_compareBtn;
    QPushButton* m_findIssuesBtn;
    QProgressBar* m_progressBar;
    QTableWidget* m_comparisonTable;
    QListWidget* m_issuesListWidget;
    QLabel* m_chartLabel;
    QScrollArea* m_chartScroll;
    QComboBox* m_referenceFontCombo;
    QPushButton* m_applyUnifiedBtn;

    QList<ComparisonReport> m_currentReports;
    QList<ComparisonReport> m_inconsistentReports;

    void setupUI();
    void populateFontList();
    void updateComparisonTable(const ComparisonReport& report);
    void displayChart(const ComparisonReport& report);
    void populateIssuesList();
};

#endif
