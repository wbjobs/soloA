#include "ui/AutoKerningPanel.h"
#include <QHeaderView>
#include <QMessageBox>
#include <QDateTime>
#include <QTimer>

AutoKerningPanel::AutoKerningPanel(QWidget* parent)
    : QWidget(parent)
    , m_adjuster(nullptr)
    , m_analyzer(new AutoKerningAnalyzer(this))
{
    setupUI();

    connect(m_analyzer, &AutoKerningAnalyzer::analysisProgress,
            this, &AutoKerningPanel::onAnalysisProgress);
    connect(m_analyzer, &AutoKerningAnalyzer::analysisFinished,
            this, &AutoKerningPanel::onAnalysisFinished);
}

AutoKerningPanel::~AutoKerningPanel()
{
}

void AutoKerningPanel::setAdjuster(KerningAdjuster* adjuster)
{
    m_adjuster = adjuster;
    m_startBtn->setEnabled(adjuster && adjuster->fontInfo());
}

void AutoKerningPanel::setupUI()
{
    QVBoxLayout* mainLayout = new QVBoxLayout(this);
    mainLayout->setContentsMargins(10, 10, 10, 10);

    QGroupBox* settingsGroup = new QGroupBox(tr("分析设置"), this);
    QVBoxLayout* settingsLayout = new QVBoxLayout(settingsGroup);

    QHBoxLayout* modeLayout = new QHBoxLayout();
    modeLayout->addWidget(new QLabel(tr("分析模式:"), this));
    m_modeCombo = new QComboBox(this);
    m_modeCombo->addItem(tr("轮廓分析"), static_cast<int>(AutoKerningAnalyzer::AnalysisMode::ProfileBased));
    m_modeCombo->addItem(tr("密度分析"), static_cast<int>(AutoKerningAnalyzer::AnalysisMode::AreaBased));
    m_modeCombo->addItem(tr("综合分析 (推荐)"), static_cast<int>(AutoKerningAnalyzer::AnalysisMode::Combined));
    m_modeCombo->setCurrentIndex(2);
    modeLayout->addWidget(m_modeCombo);
    modeLayout->addStretch();
    settingsLayout->addLayout(modeLayout);

    QHBoxLayout* paramsLayout = new QHBoxLayout();
    paramsLayout->addWidget(new QLabel(tr("目标间距:"), this));
    m_targetSpacingSpin = new QSpinBox(this);
    m_targetSpacingSpin->setRange(1, 50);
    m_targetSpacingSpin->setValue(12);
    m_targetSpacingSpin->setSuffix(tr(" 像素"));
    paramsLayout->addWidget(m_targetSpacingSpin);

    paramsLayout->addWidget(new QLabel(tr("分析字号:"), this));
    m_fontSizeSpin = new QSpinBox(this);
    m_fontSizeSpin->setRange(12, 200);
    m_fontSizeSpin->setValue(48);
    m_fontSizeSpin->setSuffix(tr(" 点"));
    paramsLayout->addWidget(m_fontSizeSpin);
    paramsLayout->addStretch();
    settingsLayout->addLayout(paramsLayout);

    QHBoxLayout* sampleLayout = new QHBoxLayout();
    sampleLayout->addWidget(new QLabel(tr("预设样本:"), this));
    m_samplePresetCombo = new QComboBox(this);
    m_samplePresetCombo->addItem(tr("常用英文词"), "english");
    m_samplePresetCombo->addItem(tr("常用中文词"), "chinese");
    m_samplePresetCombo->addItem(tr("中英文混合"), "mixed");
    m_samplePresetCombo->addItem(tr("常见字母对"), "letter_pairs");
    m_samplePresetCombo->setCurrentIndex(3);
    sampleLayout->addWidget(m_samplePresetCombo);
    sampleLayout->addStretch();
    settingsLayout->addLayout(sampleLayout);

    QHBoxLayout* checkLayout = new QHBoxLayout();
    m_useEnglishCheck = new QCheckBox(tr("使用英文样本"), this);
    m_useEnglishCheck->setChecked(true);
    checkLayout->addWidget(m_useEnglishCheck);

    m_useChineseCheck = new QCheckBox(tr("使用中文样本"), this);
    checkLayout->addWidget(m_useChineseCheck);

    m_useCustomCheck = new QCheckBox(tr("使用自定义文本"), this);
    checkLayout->addWidget(m_useCustomCheck);
    checkLayout->addStretch();
    settingsLayout->addLayout(checkLayout);

    QLabel* customLabel = new QLabel(tr("自定义分析文本 (每行一个样本):"), this);
    settingsLayout->addWidget(customLabel);

    m_customSampleEdit = new QPlainTextEdit(this);
    m_customSampleEdit->setPlaceholderText(tr("例如:\nHello World\nType Design\nAVAWAV\nToTeTy"));
    m_customSampleEdit->setMaximumHeight(80);
    m_customSampleEdit->setEnabled(false);
    settingsLayout->addWidget(m_customSampleEdit);

    connect(m_useCustomCheck, &QCheckBox::toggled,
            m_customSampleEdit, &QPlainTextEdit::setEnabled);

    mainLayout->addWidget(settingsGroup);

    QHBoxLayout* actionLayout = new QHBoxLayout();
    m_startBtn = new QPushButton(tr("开始分析"), this);
    m_startBtn->setMinimumHeight(35);
    m_startBtn->setEnabled(false);
    actionLayout->addWidget(m_startBtn);

    m_progressBar = new QProgressBar(this);
    m_progressBar->setVisible(false);
    actionLayout->addWidget(m_progressBar);

    actionLayout->addStretch();
    mainLayout->addLayout(actionLayout);

    QGroupBox* resultsGroup = new QGroupBox(tr("分析结果"), this);
    QVBoxLayout* resultsLayout = new QVBoxLayout(resultsGroup);

    QHBoxLayout* selectLayout = new QHBoxLayout();
    m_selectAllBtn = new QPushButton(tr("全选"), this);
    selectLayout->addWidget(m_selectAllBtn);
    m_selectNoneBtn = new QPushButton(tr("全不选"), this);
    selectLayout->addWidget(m_selectNoneBtn);
    selectLayout->addStretch();
    resultsLayout->addLayout(selectLayout);

    m_resultsTable = new QTableWidget(this);
    m_resultsTable->setColumnCount(6);
    m_resultsTable->setHorizontalHeaderLabels({
        tr("应用"),
        tr("字符对"),
        tr("当前值"),
        tr("推荐值"),
        tr("变化量"),
        tr("置信度")
    });
    m_resultsTable->horizontalHeader()->setStretchLastSection(false);
    m_resultsTable->horizontalHeader()->setSectionResizeMode(0, QHeaderView::ResizeToContents);
    m_resultsTable->horizontalHeader()->setSectionResizeMode(1, QHeaderView::ResizeToContents);
    m_resultsTable->horizontalHeader()->setSectionResizeMode(2, QHeaderView::ResizeToContents);
    m_resultsTable->horizontalHeader()->setSectionResizeMode(3, QHeaderView::ResizeToContents);
    m_resultsTable->horizontalHeader()->setSectionResizeMode(4, QHeaderView::ResizeToContents);
    m_resultsTable->horizontalHeader()->setSectionResizeMode(5, QHeaderView::Stretch);
    m_resultsTable->setSelectionBehavior(QAbstractItemView::SelectRows);
    m_resultsTable->setAlternatingRowColors(true);
    resultsLayout->addWidget(m_resultsTable);

    QHBoxLayout* applyLayout = new QHBoxLayout();
    m_applySelectedBtn = new QPushButton(tr("应用选中项"), this);
    m_applySelectedBtn->setEnabled(false);
    applyLayout->addWidget(m_applySelectedBtn);

    m_applyAllBtn = new QPushButton(tr("应用全部"), this);
    m_applyAllBtn->setEnabled(false);
    applyLayout->addWidget(m_applyAllBtn);
    applyLayout->addStretch();
    resultsLayout->addLayout(applyLayout);

    mainLayout->addWidget(resultsGroup);

    connect(m_startBtn, &QPushButton::clicked,
            this, &AutoKerningPanel::onStartAnalysis);
    connect(m_applySelectedBtn, &QPushButton::clicked,
            this, &AutoKerningPanel::onApplySelected);
    connect(m_applyAllBtn, &QPushButton::clicked,
            this, &AutoKerningPanel::onApplyAll);
    connect(m_selectAllBtn, &QPushButton::clicked,
            this, &AutoKerningPanel::onSelectAll);
    connect(m_selectNoneBtn, &QPushButton::clicked,
            this, &AutoKerningPanel::onSelectNone);
}

QStringList AutoKerningPanel::buildSampleTexts()
{
    QStringList samples;

    if (m_useEnglishCheck->isChecked()) {
        samples << AutoKerningAnalyzer::defaultEnglishSamples();
    }

    if (m_useChineseCheck->isChecked()) {
        samples << AutoKerningAnalyzer::defaultChineseSamples();
    }

    if (m_useCustomCheck->isChecked()) {
        QString custom = m_customSampleEdit->toPlainText();
        if (!custom.isEmpty()) {
            QStringList lines = custom.split('\n', Qt::SkipEmptyParts);
            for (const QString& line : lines) {
                if (!line.trimmed().isEmpty()) {
                    samples << line.trimmed();
                }
            }
        }
    }

    if (samples.isEmpty()) {
        samples << AutoKerningAnalyzer::defaultEnglishSamples();
    }

    return samples;
}

void AutoKerningPanel::onStartAnalysis()
{
    if (!m_adjuster || !m_adjuster->fontInfo()) {
        QMessageBox::information(this, tr("提示"), tr("请先加载字体文件。"));
        return;
    }

    m_analyzer->setAnalysisMode(static_cast<AutoKerningAnalyzer::AnalysisMode>(
        m_modeCombo->currentData().toInt()
    ));
    m_analyzer->setTargetSpacing(m_targetSpacingSpin->value());

    m_startBtn->setEnabled(false);
    m_progressBar->setVisible(true);
    m_progressBar->setValue(0);
    m_resultsTable->clearContents();
    m_resultsTable->setRowCount(0);
    m_recommendations.clear();
    m_applySelectedBtn->setEnabled(false);
    m_applyAllBtn->setEnabled(false);

    QStringList samples = buildSampleTexts();
    QString fontPath = m_adjuster->fontInfo()->filePath;
    int fontSize = m_fontSizeSpin->value();

    QTimer::singleShot(100, this, [this, fontPath, samples, fontSize]() {
        QList<KerningRecommendation> recs = m_analyzer->analyzeFont(
            fontPath,
            samples,
            fontSize
        );
        onAnalysisFinished(recs);
    });
}

void AutoKerningPanel::onAnalysisProgress(int current, int total)
{
    m_progressBar->setMaximum(total);
    m_progressBar->setValue(current);
}

void AutoKerningPanel::onAnalysisFinished(const QList<KerningRecommendation>& recommendations)
{
    m_recommendations = recommendations;
    populateResultsTable();

    m_progressBar->setVisible(false);
    m_startBtn->setEnabled(true);

    bool hasResults = !recommendations.isEmpty();
    m_applySelectedBtn->setEnabled(hasResults);
    m_applyAllBtn->setEnabled(hasResults);

    if (!hasResults) {
        QMessageBox::information(this, tr("分析完成"),
            tr("分析完成，没有发现需要调整的字距对。"));
    } else {
        QMessageBox::information(this, tr("分析完成"),
            tr("分析完成，发现 %1 个建议调整的字距对。").arg(recommendations.size()));
    }
}

void AutoKerningPanel::populateResultsTable()
{
    m_resultsTable->clearContents();
    m_resultsTable->setRowCount(m_recommendations.size());

    for (int i = 0; i < m_recommendations.size(); ++i) {
        addRecommendationToTable(m_recommendations[i], i);
    }
}

void AutoKerningPanel::addRecommendationToTable(const KerningRecommendation& rec, int row)
{
    QTableWidgetItem* checkItem = new QTableWidgetItem();
    checkItem->setCheckState(Qt::Checked);
    checkItem->setFlags(Qt::ItemIsUserCheckable | Qt::ItemIsEnabled);
    m_resultsTable->setItem(row, 0, checkItem);

    QTableWidgetItem* pairItem = new QTableWidgetItem(rec.pairString());
    pairItem->setTextAlignment(Qt::AlignCenter);
    pairItem->setFlags(pairItem->flags() & ~Qt::ItemIsEditable);
    m_resultsTable->setItem(row, 1, pairItem);

    QTableWidgetItem* currentItem = new QTableWidgetItem(QString::number(rec.currentKerning));
    currentItem->setTextAlignment(Qt::AlignCenter);
    currentItem->setFlags(currentItem->flags() & ~Qt::ItemIsEditable);
    m_resultsTable->setItem(row, 2, currentItem);

    QTableWidgetItem* recommendItem = new QTableWidgetItem(QString::number(rec.recommendedKerning));
    recommendItem->setTextAlignment(Qt::AlignCenter);
    recommendItem->setFlags(recommendItem->flags() & ~Qt::ItemIsEditable);
    recommendItem->setForeground(QBrush(QColor(0, 120, 0)));
    m_resultsTable->setItem(row, 3, recommendItem);

    int delta = rec.recommendedKerning - rec.currentKerning;
    QString deltaStr = delta > 0 ? QString("+%1").arg(delta) : QString::number(delta);
    QTableWidgetItem* deltaItem = new QTableWidgetItem(deltaStr);
    deltaItem->setTextAlignment(Qt::AlignCenter);
    deltaItem->setFlags(deltaItem->flags() & ~Qt::ItemIsEditable);
    if (delta > 0) {
        deltaItem->setForeground(QBrush(QColor(200, 0, 0)));
    } else if (delta < 0) {
        deltaItem->setForeground(QBrush(QColor(0, 0, 200)));
    }
    m_resultsTable->setItem(row, 4, deltaItem);

    QTableWidgetItem* confItem = new QTableWidgetItem(QString("%1%").arg(rec.confidence));
    confItem->setTextAlignment(Qt::AlignCenter);
    confItem->setFlags(confItem->flags() & ~Qt::ItemIsEditable);
    if (rec.confidence >= 80) {
        confItem->setForeground(QBrush(QColor(0, 150, 0)));
    } else if (rec.confidence >= 50) {
        confItem->setForeground(QBrush(QColor(150, 100, 0)));
    } else {
        confItem->setForeground(QBrush(QColor(150, 0, 0)));
    }
    m_resultsTable->setItem(row, 5, confItem);
}

void AutoKerningPanel::onApplySelected()
{
    if (!m_adjuster) return;

    int applied = 0;
    for (int i = 0; i < m_resultsTable->rowCount(); ++i) {
        QTableWidgetItem* checkItem = m_resultsTable->item(i, 0);
        if (checkItem && checkItem->checkState() == Qt::Checked && i < m_recommendations.size()) {
            const KerningRecommendation& rec = m_recommendations[i];
            m_adjuster->setKerningValue(rec.leftChar, rec.rightChar, rec.recommendedKerning);
            ++applied;
        }
    }

    QMessageBox::information(this, tr("应用完成"),
        tr("已应用 %1 个调整。").arg(applied));
    emit recommendationsApplied(applied);
}

void AutoKerningPanel::onApplyAll()
{
    if (!m_adjuster) return;

    for (const KerningRecommendation& rec : m_recommendations) {
        m_adjuster->setKerningValue(rec.leftChar, rec.rightChar, rec.recommendedKerning);
    }

    QMessageBox::information(this, tr("应用完成"),
        tr("已应用全部 %1 个调整。").arg(m_recommendations.size()));
    emit recommendationsApplied(m_recommendations.size());
}

void AutoKerningPanel::onSelectAll()
{
    for (int i = 0; i < m_resultsTable->rowCount(); ++i) {
        QTableWidgetItem* item = m_resultsTable->item(i, 0);
        if (item) {
            item->setCheckState(Qt::Checked);
        }
    }
}

void AutoKerningPanel::onSelectNone()
{
    for (int i = 0; i < m_resultsTable->rowCount(); ++i) {
        QTableWidgetItem* item = m_resultsTable->item(i, 0);
        if (item) {
            item->setCheckState(Qt::Unchecked);
        }
    }
}
