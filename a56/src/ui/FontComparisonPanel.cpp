#include "ui/FontComparisonPanel.h"
#include <QHeaderView>
#include <QMessageBox>
#include <QFileInfo>
#include <QImage>
#include <QPixmap>
#include <QTimer>
#include <QMap>

FontComparisonPanel::FontComparisonPanel(FontManager* manager, QWidget* parent)
    : QWidget(parent)
    , m_fontManager(manager)
    , m_adjuster(nullptr)
    , m_comparisonManager(new FontComparisonManager(this))
{
    setupUI();

    connect(m_comparisonManager, &FontComparisonManager::comparisonProgress,
            this, &FontComparisonPanel::onComparisonProgress);
    connect(m_comparisonManager, &FontComparisonManager::comparisonFinished,
            this, &FontComparisonPanel::onComparisonFinished);

    populateFontList();
}

FontComparisonPanel::~FontComparisonPanel()
{
}

void FontComparisonPanel::setAdjuster(KerningAdjuster* adjuster)
{
    m_adjuster = adjuster;
}

void FontComparisonPanel::setupUI()
{
    QVBoxLayout* mainLayout = new QVBoxLayout(this);
    mainLayout->setContentsMargins(10, 10, 10, 10);

    QGroupBox* fontsGroup = new QGroupBox(tr("选择字体进行对比"), this);
    QVBoxLayout* fontsLayout = new QVBoxLayout(fontsGroup);

    QHBoxLayout* fontActionsLayout = new QHBoxLayout();
    m_addFontsBtn = new QPushButton(tr("添加字体"), this);
    fontActionsLayout->addWidget(m_addFontsBtn);
    m_removeBtn = new QPushButton(tr("移除选中"), this);
    fontActionsLayout->addWidget(m_removeBtn);
    m_clearBtn = new QPushButton(tr("清空列表"), this);
    fontActionsLayout->addWidget(m_clearBtn);
    fontActionsLayout->addStretch();
    fontsLayout->addLayout(fontActionsLayout);

    m_fontListWidget = new QListWidget(this);
    m_fontListWidget->setSelectionMode(QAbstractItemView::MultiSelection);
    m_fontListWidget->setMaximumHeight(120);
    fontsLayout->addWidget(m_fontListWidget);

    mainLayout->addWidget(fontsGroup);

    QGroupBox* settingsGroup = new QGroupBox(tr("对比设置"), this);
    QHBoxLayout* settingsLayout = new QHBoxLayout(settingsGroup);

    settingsLayout->addWidget(new QLabel(tr("预览字号:"), this));
    m_previewSizeSpin = new QSpinBox(this);
    m_previewSizeSpin->setRange(12, 96);
    m_previewSizeSpin->setValue(36);
    m_previewSizeSpin->setSuffix(tr(" 点"));
    settingsLayout->addWidget(m_previewSizeSpin);

    settingsLayout->addWidget(new QLabel(tr("异常阈值:"), this));
    m_thresholdSpin = new QSpinBox(this);
    m_thresholdSpin->setRange(1, 20);
    m_thresholdSpin->setValue(3);
    m_thresholdSpin->setSuffix(tr(" 像素"));
    settingsLayout->addWidget(m_thresholdSpin);

    settingsLayout->addWidget(new QLabel(tr("参考字体:"), this));
    m_referenceFontCombo = new QComboBox(this);
    m_referenceFontCombo->addItem(tr("使用平均值"), -1);
    settingsLayout->addWidget(m_referenceFontCombo);

    settingsLayout->addStretch();
    mainLayout->addWidget(settingsGroup);

    QHBoxLayout* actionLayout = new QHBoxLayout();
    m_compareBtn = new QPushButton(tr("开始对比"), this);
    m_compareBtn->setMinimumHeight(35);
    actionLayout->addWidget(m_compareBtn);

    m_findIssuesBtn = new QPushButton(tr("查找不一致"), this);
    m_findIssuesBtn->setMinimumHeight(35);
    actionLayout->addWidget(m_findIssuesBtn);

    m_progressBar = new QProgressBar(this);
    m_progressBar->setVisible(false);
    actionLayout->addWidget(m_progressBar);
    actionLayout->addStretch();
    mainLayout->addLayout(actionLayout);

    QSplitter* mainSplitter = new QSplitter(Qt::Horizontal, this);

    QWidget* leftPanel = new QWidget(this);
    QVBoxLayout* leftLayout = new QVBoxLayout(leftPanel);
    leftLayout->setContentsMargins(0, 0, 0, 0);

    QGroupBox* comparisonGroup = new QGroupBox(tr("字距对比详情"), this);
    QVBoxLayout* comparisonLayout = new QVBoxLayout(comparisonGroup);

    m_comparisonTable = new QTableWidget(this);
    m_comparisonTable->setColumnCount(6);
    m_comparisonTable->setHorizontalHeaderLabels({
        tr("字符对"),
        tr("平均值"),
        tr("最小值"),
        tr("最大值"),
        tr("标准差"),
        tr("异常字体")
    });
    m_comparisonTable->horizontalHeader()->setStretchLastSection(true);
    m_comparisonTable->setSelectionBehavior(QAbstractItemView::SelectRows);
    m_comparisonTable->setAlternatingRowColors(true);
    comparisonLayout->addWidget(m_comparisonTable);

    leftLayout->addWidget(comparisonGroup);

    QGroupBox* issuesGroup = new QGroupBox(tr("不一致的字距对"), this);
    QVBoxLayout* issuesLayout = new QVBoxLayout(issuesGroup);

    m_issuesListWidget = new QListWidget(this);
    connect(m_issuesListWidget, &QListWidget::itemClicked,
            this, &FontComparisonPanel::onReportSelected);
    issuesLayout->addWidget(m_issuesListWidget);

    QHBoxLayout* applyLayout = new QHBoxLayout();
    m_applyUnifiedBtn = new QPushButton(tr("应用统一校准"), this);
    m_applyUnifiedBtn->setEnabled(false);
    applyLayout->addWidget(m_applyUnifiedBtn);
    applyLayout->addStretch();
    issuesLayout->addLayout(applyLayout);

    leftLayout->addWidget(issuesGroup);

    mainSplitter->addWidget(leftPanel);

    QGroupBox* chartGroup = new QGroupBox(tr("可视化对比"), this);
    QVBoxLayout* chartLayout = new QVBoxLayout(chartGroup);

    m_chartScroll = new QScrollArea(this);
    m_chartScroll->setWidgetResizable(true);
    m_chartScroll->setBackgroundRole(QPalette::Light);

    m_chartLabel = new QLabel(this);
    m_chartLabel->setAlignment(Qt::AlignCenter);
    m_chartLabel->setText(tr("选择字符对查看对比图表"));
    m_chartLabel->setMinimumHeight(300);
    m_chartLabel->setStyleSheet("QLabel { background-color: white; }");

    m_chartScroll->setWidget(m_chartLabel);
    chartLayout->addWidget(m_chartScroll);

    mainSplitter->addWidget(chartGroup);
    mainSplitter->setStretchFactor(0, 1);
    mainSplitter->setStretchFactor(1, 1);

    mainLayout->addWidget(mainSplitter);

    connect(m_addFontsBtn, &QPushButton::clicked,
            this, &FontComparisonPanel::onAddFonts);
    connect(m_removeBtn, &QPushButton::clicked,
            this, &FontComparisonPanel::onRemoveSelected);
    connect(m_clearBtn, &QPushButton::clicked,
            this, &FontComparisonPanel::onClearAll);
    connect(m_compareBtn, &QPushButton::clicked,
            this, &FontComparisonPanel::onStartComparison);
    connect(m_findIssuesBtn, &QPushButton::clicked,
            this, &FontComparisonPanel::onFindInconsistencies);
    connect(m_applyUnifiedBtn, &QPushButton::clicked,
            this, &FontComparisonPanel::onApplyUnified);
}

void FontComparisonPanel::populateFontList()
{
    m_fontListWidget->clear();
    m_referenceFontCombo->clear();
    m_referenceFontCombo->addItem(tr("使用平均值"), -1);

    if (m_fontManager) {
        QStringList paths = m_fontManager->fontPaths();
        for (const QString& path : paths) {
            QFileInfo fi(path);
            QListWidgetItem* item = new QListWidgetItem(fi.baseName(), m_fontListWidget);
            item->setData(Qt::UserRole, path);
            item->setCheckState(Qt::Unchecked);
            m_fontListWidget->addItem(item);

            m_referenceFontCombo->addItem(fi.baseName(), m_referenceFontCombo->count() - 1);
        }
    }
}

void FontComparisonPanel::onAddFonts()
{
    QStringList files = QFileDialog::getOpenFileNames(
        this,
        tr("选择字体文件"),
        QString(),
        tr("字体文件 (*.ttf *.otf)")
    );

    if (!files.isEmpty() && m_fontManager) {
        for (const QString& file : files) {
            m_fontManager->loadFont(file);
        }
        populateFontList();
    }
}

void FontComparisonPanel::onRemoveSelected()
{
    for (QListWidgetItem* item : m_fontListWidget->selectedItems()) {
        QString path = item->data(Qt::UserRole).toString();
        if (m_fontManager) {
            m_fontManager->unloadFont(path);
        }
    }
    populateFontList();
}

void FontComparisonPanel::onClearAll()
{
    m_fontListWidget->clear();
    m_comparisonTable->clearContents();
    m_comparisonTable->setRowCount(0);
    m_issuesListWidget->clear();
    m_chartLabel->setText(tr("选择字符对查看对比图表"));
    m_currentReports.clear();
    m_inconsistentReports.clear();
    m_applyUnifiedBtn->setEnabled(false);

    if (m_fontManager) {
        m_fontManager->unloadAllFonts();
    }
    m_referenceFontCombo->clear();
    m_referenceFontCombo->addItem(tr("使用平均值"), -1);
}

void FontComparisonPanel::onStartComparison()
{
    QStringList selectedFonts;
    for (int i = 0; i < m_fontListWidget->count(); ++i) {
        QListWidgetItem* item = m_fontListWidget->item(i);
        if (item->checkState() == Qt::Checked) {
            selectedFonts.append(item->data(Qt::UserRole).toString());
        }
    }

    if (selectedFonts.size() < 2) {
        QMessageBox::information(this, tr("提示"),
            tr("请至少选择 2 个字体进行对比。\n请勾选字体列表中的复选框。"));

        for (int i = 0; i < m_fontListWidget->count(); ++i) {
            m_fontListWidget->item(i)->setCheckState(Qt::Checked);
        }
        return;
    }

    m_comparisonManager->setFontPaths(selectedFonts);
    m_comparisonManager->setPreviewSize(m_previewSizeSpin->value());

    m_compareBtn->setEnabled(false);
    m_findIssuesBtn->setEnabled(false);
    m_progressBar->setVisible(true);
    m_progressBar->setValue(0);

    QList<QChar> chars;
    for (char c = 'A'; c <= 'Z'; ++c) chars << QChar(c);

    QTimer::singleShot(100, this, [this, chars]() {
        QList<ComparisonReport> reports = m_comparisonManager->compareAllPairs(
            chars.mid(0, 8), chars.mid(0, 8)
        );
        onComparisonFinished(reports);
    });
}

void FontComparisonPanel::onFindInconsistencies()
{
    QStringList selectedFonts;
    for (int i = 0; i < m_fontListWidget->count(); ++i) {
        QListWidgetItem* item = m_fontListWidget->item(i);
        if (item->checkState() == Qt::Checked) {
            selectedFonts.append(item->data(Qt::UserRole).toString());
        }
    }

    if (selectedFonts.size() < 2) {
        QMessageBox::information(this, tr("提示"),
            tr("请至少选择 2 个字体进行对比。"));
        return;
    }

    m_comparisonManager->setFontPaths(selectedFonts);
    m_comparisonManager->setPreviewSize(m_previewSizeSpin->value());

    m_compareBtn->setEnabled(false);
    m_findIssuesBtn->setEnabled(false);
    m_progressBar->setVisible(true);

    QList<QChar> chars;
    for (char c = 'A'; c <= 'Z'; ++c) chars << QChar(c);

    QTimer::singleShot(100, this, [this, chars]() {
        m_inconsistentReports = m_comparisonManager->findInconsistencies(
            chars.mid(0, 10), chars.mid(0, 10), m_thresholdSpin->value()
        );
        populateIssuesList();
        m_compareBtn->setEnabled(true);
        m_findIssuesBtn->setEnabled(true);
        m_progressBar->setVisible(false);
        m_applyUnifiedBtn->setEnabled(!m_inconsistentReports.isEmpty());

        QMessageBox::information(this, tr("分析完成"),
            tr("发现 %1 个不一致的字距对。").arg(m_inconsistentReports.size()));
    });
}

void FontComparisonPanel::onComparisonProgress(int current, int total)
{
    m_progressBar->setMaximum(total);
    m_progressBar->setValue(current);
}

void FontComparisonPanel::onComparisonFinished(const QList<ComparisonReport>& reports)
{
    m_currentReports = reports;
    m_comparisonTable->clearContents();
    m_comparisonTable->setRowCount(reports.size());

    for (int i = 0; i < reports.size(); ++i) {
        const ComparisonReport& report = reports[i];

        QTableWidgetItem* pairItem = new QTableWidgetItem(
            QString("%1%2").arg(report.leftChar).arg(report.rightChar)
        );
        pairItem->setData(Qt::UserRole, i);
        pairItem->setTextAlignment(Qt::AlignCenter);
        m_comparisonTable->setItem(i, 0, pairItem);

        QTableWidgetItem* avgItem = new QTableWidgetItem(QString::number(report.averageKerning));
        avgItem->setTextAlignment(Qt::AlignCenter);
        m_comparisonTable->setItem(i, 1, avgItem);

        QTableWidgetItem* minItem = new QTableWidgetItem(QString::number(report.minKerning));
        minItem->setTextAlignment(Qt::AlignCenter);
        m_comparisonTable->setItem(i, 2, minItem);

        QTableWidgetItem* maxItem = new QTableWidgetItem(QString::number(report.maxKerning));
        maxItem->setTextAlignment(Qt::AlignCenter);
        m_comparisonTable->setItem(i, 3, maxItem);

        QTableWidgetItem* stdItem = new QTableWidgetItem(QString::number(report.standardDeviation));
        stdItem->setTextAlignment(Qt::AlignCenter);
        if (report.standardDeviation > m_thresholdSpin->value()) {
            stdItem->setForeground(QBrush(QColor(200, 0, 0)));
            stdItem->setBackground(QBrush(QColor(255, 240, 240)));
        }
        m_comparisonTable->setItem(i, 4, stdItem);

        QTableWidgetItem* outlierItem = new QTableWidgetItem(report.outliers.join(", "));
        if (!report.outliers.isEmpty()) {
            outlierItem->setForeground(QBrush(QColor(200, 0, 0)));
        }
        m_comparisonTable->setItem(i, 5, outlierItem);
    }

    m_compareBtn->setEnabled(true);
    m_findIssuesBtn->setEnabled(true);
    m_progressBar->setVisible(false);
}

void FontComparisonPanel::populateIssuesList()
{
    m_issuesListWidget->clear();

    for (const ComparisonReport& report : m_inconsistentReports) {
        QString itemText = QString("%1%2 (标准差: %3, 范围: %4~%5)")
            .arg(report.leftChar)
            .arg(report.rightChar)
            .arg(report.standardDeviation)
            .arg(report.minKerning)
            .arg(report.maxKerning);
        QListWidgetItem* item = new QListWidgetItem(itemText, m_issuesListWidget);
        QVariant data;
        int idx = m_currentReports.indexOf(report);
        data.setValue(idx);
        item->setData(Qt::UserRole, data);
        m_issuesListWidget->addItem(item);
    }
}

void FontComparisonPanel::onReportSelected(QListWidgetItem* item)
{
    int idx = item->data(Qt::UserRole).toInt();
    if (idx >= 0 && idx < m_currentReports.size()) {
        displayChart(m_currentReports[idx]);
    }
}

void FontComparisonPanel::displayChart(const ComparisonReport& report)
{
    QImage chart = m_comparisonManager->createComparisonChart(report);
    if (!chart.isNull()) {
        QPixmap pixmap = QPixmap::fromImage(chart);
        m_chartLabel->setPixmap(pixmap);
        m_chartLabel->adjustSize();
    } else {
        m_chartLabel->setText(tr("无法生成图表"));
    }
}

void FontComparisonPanel::onApplyUnified()
{
    if (!m_adjuster || !m_adjuster->fontInfo()) {
        QMessageBox::information(this, tr("提示"), tr("请先在主界面选择目标字体。"));
        return;
    }

    if (m_inconsistentReports.isEmpty()) {
        return;
    }

    int refIndex = m_referenceFontCombo->currentData().toInt();
    QMap<QString, QList<KerningPair>> unified =
        m_comparisonManager->getUnifiedKerning(m_inconsistentReports, refIndex);

    QString currentFont = m_adjuster->fontInfo()->filePath;
    if (unified.contains(currentFont)) {
        const QList<KerningPair>& pairs = unified[currentFont];
        for (const KerningPair& pair : pairs) {
            m_adjuster->setKerningValue(pair.leftChar(), pair.rightChar(), pair.value());
        }

        QMessageBox::information(this, tr("应用完成"),
            tr("已为当前字体应用 %1 个统一校准值。").arg(pairs.size()));
        emit unifiedKerningApplied(currentFont, pairs.size());
    } else {
        QMessageBox::information(this, tr("提示"),
            tr("当前字体不需要调整。"));
    }
}
