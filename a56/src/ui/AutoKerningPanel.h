#ifndef AUTOKERNINGPANEL_H
#define AUTOKERNINGPANEL_H

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
#include <QPlainTextEdit>
#include <QThread>

#include "core/AutoKerningAnalyzer.h"
#include "core/KerningAdjuster.h"

class AutoKerningPanel : public QWidget
{
    Q_OBJECT
public:
    explicit AutoKerningPanel(QWidget* parent = nullptr);
    ~AutoKerningPanel();

    void setAdjuster(KerningAdjuster* adjuster);

signals:
    void recommendationsApplied(int count);

private slots:
    void onStartAnalysis();
    void onApplySelected();
    void onApplyAll();
    void onAnalysisProgress(int current, int total);
    void onAnalysisFinished(const QList<KerningRecommendation>& recommendations);
    void onSelectAll();
    void onSelectNone();
    void onInvertSelection();

private:
    KerningAdjuster* m_adjuster;
    AutoKerningAnalyzer* m_analyzer;

    QComboBox* m_modeCombo;
    QSpinBox* m_targetSpacingSpin;
    QSpinBox* m_fontSizeSpin;
    QComboBox* m_samplePresetCombo;
    QPlainTextEdit* m_customSampleEdit;
    QCheckBox* m_useEnglishCheck;
    QCheckBox* m_useChineseCheck;
    QCheckBox* m_useCustomCheck;
    QPushButton* m_startBtn;
    QProgressBar* m_progressBar;
    QTableWidget* m_resultsTable;
    QPushButton* m_applySelectedBtn;
    QPushButton* m_applyAllBtn;
    QPushButton* m_selectAllBtn;
    QPushButton* m_selectNoneBtn;

    QList<KerningRecommendation> m_recommendations;

    void setupUI();
    QStringList buildSampleTexts();
    void populateResultsTable();
    void addRecommendationToTable(const KerningRecommendation& rec, int row);
};

#endif
