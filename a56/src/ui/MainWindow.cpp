#include "ui/MainWindow.h"
#include "ui/SettingsDialog.h"
#include <QCloseEvent>
#include <QStyle>
#include <QApplication>
#include <QStandardPaths>
#include <QFileInfo>
#include <QDir>
#include <QDebug>

MainWindow::MainWindow(QWidget* parent)
    : QMainWindow(parent)
    , m_fontManager(new FontManager(this))
    , m_kerningAdjuster(new KerningAdjuster(this))
    , m_previewRenderer(new PreviewRenderer(this))
    , m_exporter(new Exporter(this))
    , m_undoAction(nullptr)
    , m_redoAction(nullptr)
    , m_progressBar(nullptr)
{
    setWindowTitle(tr("字体字距校准工具 - Kerning Adjuster"));
    setMinimumSize(1200, 800);
    resize(1400, 900);

    ConfigManager::instance()->load();

    setupUI();
    setupMenuBar();
    setupToolBar();
    setupStatusBar();
    updateActions();
}

MainWindow::~MainWindow()
{
    ConfigManager::instance()->save();
}

void MainWindow::closeEvent(QCloseEvent* event)
{
    if (m_kerningAdjuster && m_kerningAdjuster->modifiedPairs().size() > 0) {
        QMessageBox::StandardButton reply = QMessageBox::question(
            this,
            tr("未保存的更改"),
            tr("当前字体有未保存的字距修改。\n确定要退出吗？"),
            QMessageBox::Yes | QMessageBox::No | QMessageBox::Cancel,
            QMessageBox::Cancel
        );

        if (reply == QMessageBox::Cancel) {
            event->ignore();
            return;
        }
    }

    event->accept();
}

void MainWindow::setupUI()
{
    QSplitter* mainSplitter = new QSplitter(Qt::Horizontal, this);

    m_fontListWidget = new FontListWidget(m_fontManager, this);
    m_fontListWidget->setMinimumWidth(250);
    mainSplitter->addWidget(m_fontListWidget);

    m_mainTabWidget = new QTabWidget(this);

    QWidget* manualTab = new QWidget(this);
    QVBoxLayout* manualLayout = new QVBoxLayout(manualTab);
    manualLayout->setContentsMargins(0, 0, 0, 0);

    QSplitter* rightSplitter = new QSplitter(Qt::Vertical, this);

    m_kerningTableWidget = new KerningTableWidget(m_kerningAdjuster, this);
    rightSplitter->addWidget(m_kerningTableWidget);

    m_previewWidget = new PreviewWidget(m_previewRenderer, this);
    m_previewWidget->setMinimumHeight(200);
    rightSplitter->addWidget(m_previewWidget);

    rightSplitter->setStretchFactor(0, 3);
    rightSplitter->setStretchFactor(1, 2);

    manualLayout->addWidget(rightSplitter);

    m_mainTabWidget->addTab(manualTab, tr("手动调整"));

    m_autoKerningPanel = new AutoKerningPanel(this);
    m_mainTabWidget->addTab(m_autoKerningPanel, tr("自动校准"));

    m_comparisonPanel = new FontComparisonPanel(m_fontManager, this);
    m_mainTabWidget->addTab(m_comparisonPanel, tr("批量对比"));

    mainSplitter->addWidget(m_mainTabWidget);
    mainSplitter->setStretchFactor(0, 1);
    mainSplitter->setStretchFactor(1, 4);

    setCentralWidget(mainSplitter);

    connect(m_fontListWidget, &FontListWidget::fontSelected,
            this, &MainWindow::onFontSelected);
    connect(m_kerningAdjuster, &KerningAdjuster::kerningChanged,
            this, &MainWindow::onFontChanged);

    connect(m_kerningAdjuster->historyManager(), &HistoryManager::canUndoChanged,
            this, [this](bool can) {
                if (m_undoAction) m_undoAction->setEnabled(can);
            });
    connect(m_kerningAdjuster->historyManager(), &HistoryManager::canRedoChanged,
            this, [this](bool can) {
                if (m_redoAction) m_redoAction->setEnabled(can);
            });

    connect(m_exporter, &Exporter::exportProgress,
            this, &MainWindow::onExportProgress);
    connect(m_exporter, &Exporter::exportFinished,
            this, &MainWindow::onExportFinished);

    connect(m_autoKerningPanel, &AutoKerningPanel::recommendationsApplied,
            this, &MainWindow::onAutoKerningRecommendationsApplied);
    connect(m_comparisonPanel, &FontComparisonPanel::unifiedKerningApplied,
            this, &MainWindow::onUnifiedKerningApplied);
}

void MainWindow::setupMenuBar()
{
    QMenuBar* menuBar = this->menuBar();

    QMenu* fileMenu = menuBar->addMenu(tr("文件(&F)"));

    QAction* openFontAction = fileMenu->addAction(tr("打开字体(&O)..."));
    openFontAction->setShortcut(QKeySequence::Open);
    openFontAction->setIcon(style()->standardIcon(QStyle::SP_FileDialogOpen));
    connect(openFontAction, &QAction::triggered, this, &MainWindow::OpenFont);

    QAction* openFolderAction = fileMenu->addAction(tr("打开字体文件夹(&D)..."));
    openFolderAction->setShortcut(tr("Ctrl+Shift+O"));
    connect(openFolderAction, &QAction::triggered, this, &MainWindow::OpenFontFolder);

    fileMenu->addSeparator();

    QMenu* exportMenu = fileMenu->addMenu(tr("导出(&E)"));

    QAction* exportJSONAction = exportMenu->addAction(tr("导出为 JSON..."));
    exportJSONAction->setShortcut(tr("Ctrl+S"));
    connect(exportJSONAction, &QAction::triggered, this, &MainWindow::onExportJSON);

    QAction* exportCSVAction = exportMenu->addAction(tr("导出为 CSV..."));
    connect(exportCSVAction, &QAction::triggered, this, &MainWindow::onExportCSV);

    QAction* exportFontAction = exportMenu->addAction(tr("导出为字体文件..."));
    connect(exportFontAction, &QAction::triggered, this, &MainWindow::onExportFont);

    fileMenu->addSeparator();

    QMenu* importMenu = fileMenu->addMenu(tr("导入(&I)"));

    QAction* importJSONAction = importMenu->addAction(tr("导入字距数据 (JSON)..."));
    connect(importJSONAction, &QAction::triggered, this, &MainWindow::onImportJSON);

    QAction* importCSVAction = importMenu->addAction(tr("导入字距数据 (CSV)..."));
    connect(importCSVAction, &QAction::triggered, this, &MainWindow::onImportCSV);

    fileMenu->addSeparator();

    QAction* exitAction = fileMenu->addAction(tr("退出(&X)"));
    exitAction->setShortcut(QKeySequence::Quit);
    connect(exitAction, &QAction::triggered, this, &QWidget::close);

    QMenu* editMenu = menuBar->addMenu(tr("编辑(&E)"));

    m_undoAction = editMenu->addAction(tr("撤销(&U)"));
    m_undoAction->setShortcut(QKeySequence::Undo);
    m_undoAction->setIcon(style()->standardIcon(QStyle::SP_ArrowBack));
    m_undoAction->setEnabled(false);
    connect(m_undoAction, &QAction::triggered, this, &MainWindow::onUndo);

    m_redoAction = editMenu->addAction(tr("重做(&R)"));
    m_redoAction->setShortcut(QKeySequence::Redo);
    m_redoAction->setIcon(style()->standardIcon(QStyle::SP_ArrowForward));
    m_redoAction->setEnabled(false);
    connect(m_redoAction, &QAction::triggered, this, &MainWindow::onRedo);

    QMenu* toolsMenu = menuBar->addMenu(tr("工具(&T)"));

    QAction* settingsAction = toolsMenu->addAction(tr("设置(&S)..."));
    connect(settingsAction, &QAction::triggered, this, &MainWindow::onSettings);

    QMenu* helpMenu = menuBar->addMenu(tr("帮助(&H)"));

    QAction* aboutAction = helpMenu->addAction(tr("关于(&A)..."));
    connect(aboutAction, &QAction::triggered, this, &MainWindow::onAbout);
}

void MainWindow::setupToolBar()
{
    QToolBar* toolBar = addToolBar(tr("主工具栏"));
    toolBar->setMovable(false);

    QAction* openFontAction = toolBar->addAction(tr("打开字体"));
    openFontAction->setIcon(style()->standardIcon(QStyle::SP_FileDialogOpen));
    connect(openFontAction, &QAction::triggered, this, &MainWindow::OpenFont);

    QAction* openFolderAction = toolBar->addAction(tr("打开文件夹"));
    openFolderAction->setIcon(style()->standardIcon(QStyle::SP_DirOpenIcon));
    connect(openFolderAction, &QAction::triggered, this, &MainWindow::OpenFontFolder);

    toolBar->addSeparator();

    m_undoAction = toolBar->addAction(tr("撤销"));
    m_undoAction->setIcon(style()->standardIcon(QStyle::SP_ArrowBack));
    m_undoAction->setEnabled(false);
    connect(m_undoAction, &QAction::triggered, this, &MainWindow::onUndo);

    m_redoAction = toolBar->addAction(tr("重做"));
    m_redoAction->setIcon(style()->standardIcon(QStyle::SP_ArrowForward));
    m_redoAction->setEnabled(false);
    connect(m_redoAction, &QAction::triggered, this, &MainWindow::onRedo);

    toolBar->addSeparator();

    QAction* exportAction = toolBar->addAction(tr("导出"));
    exportAction->setIcon(style()->standardIcon(QStyle::SP_FileDialogSave));
    connect(exportAction, &QAction::triggered, this, &MainWindow::onExportJSON);

    toolBar->addSeparator();

    QAction* settingsAction = toolBar->addAction(tr("设置"));
    settingsAction->setIcon(style()->standardIcon(QStyle::SP_FileDialogDetailedView));
    connect(settingsAction, &QAction::triggered, this, &MainWindow::onSettings);
}

void MainWindow::setupStatusBar()
{
    QStatusBar* status = statusBar();

    m_progressBar = new QProgressBar(this);
    m_progressBar->setVisible(false);
    m_progressBar->setMaximumWidth(200);
    status->addPermanentWidget(m_progressBar);

    status->showMessage(tr("就绪。请打开字体文件开始。"));
}

void MainWindow::updateActions()
{
    bool hasFont = m_kerningAdjuster && m_kerningAdjuster->fontInfo();
    bool canUndo = m_kerningAdjuster ? m_kerningAdjuster->canUndo() : false;
    bool canRedo = m_kerningAdjuster ? m_kerningAdjuster->canRedo() : false;

    if (m_undoAction) m_undoAction->setEnabled(canUndo);
    if (m_redoAction) m_redoAction->setEnabled(canRedo);
}

void MainWindow::updateStatus()
{
    if (!m_kerningAdjuster || !m_kerningAdjuster->fontInfo()) {
        statusBar()->showMessage(tr("就绪。请打开字体文件开始。"));
        return;
    }

    auto info = m_kerningAdjuster->fontInfo();
    int modified = m_kerningAdjuster->modifiedPairs().size();
    int total = m_kerningAdjuster->kerningPairs().size();

    QString msg = tr("字体: %1 - %2 | 字距对: %3 | 已修改: %4")
        .arg(info->familyName)
        .arg(info->styleName)
        .arg(total)
        .arg(modified);

    statusBar()->showMessage(msg);
}

void MainWindow::checkForChanges()
{
    updateActions();
    updateStatus();
}

void MainWindow::OpenFont()
{
    QString startDir = ConfigManager::instance()->settings().lastOpenDirectory;
    if (startDir.isEmpty()) {
        startDir = QStandardPaths::writableLocation(QStandardPaths::DocumentsLocation);
    }

    QString fileName = QFileDialog::getOpenFileName(
        this,
        tr("选择字体文件"),
        startDir,
        tr("字体文件 (*.ttf *.otf);;TrueType 字体 (*.ttf);;OpenType 字体 (*.otf);;所有文件 (*.*)")
    );

    if (!fileName.isEmpty()) {
        QFileInfo fi(fileName);
        ConfigManager::instance()->settings().lastOpenDirectory = fi.absolutePath();

        if (m_fontManager->loadFont(fileName)) {
            m_fontListWidget->selectFont(fileName);
            onFontSelected(fileName);
        } else {
            QMessageBox::warning(this, tr("错误"), tr("无法加载字体文件: %1").arg(fileName));
        }
    }
}

void MainWindow::OpenFontFolder()
{
    QString startDir = ConfigManager::instance()->settings().lastOpenDirectory;
    if (startDir.isEmpty()) {
        startDir = QStandardPaths::writableLocation(QStandardPaths::DocumentsLocation);
    }

    QString dirPath = QFileDialog::getExistingDirectory(
        this,
        tr("选择字体文件夹"),
        startDir,
        QFileDialog::ShowDirsOnly | QFileDialog::DontResolveSymlinks
    );

    if (!dirPath.isEmpty()) {
        ConfigManager::instance()->settings().lastOpenDirectory = dirPath;

        if (!m_fontManager->loadFontsFromDirectory(dirPath)) {
            QMessageBox::information(this, tr("提示"), tr("该文件夹中没有找到支持的字体文件。"));
        }
    }
}

void MainWindow::onFontSelected(const QString& filePath)
{
    if (filePath.isEmpty()) return;

    auto fontInfo = m_fontManager->font(filePath);
    if (fontInfo) {
        m_kerningAdjuster->setFontInfo(fontInfo);
        m_kerningTableWidget->setAdjuster(m_kerningAdjuster);
        m_previewWidget->setAdjuster(m_kerningAdjuster);
        m_autoKerningPanel->setAdjuster(m_kerningAdjuster);
        m_comparisonPanel->setAdjuster(m_kerningAdjuster);
        checkForChanges();
    }
}

void MainWindow::onFontChanged(const QList<KerningPair>& pairs)
{
    Q_UNUSED(pairs)
    checkForChanges();
}

void MainWindow::onUndo()
{
    if (m_kerningAdjuster) {
        m_kerningAdjuster->undo();
        checkForChanges();
    }
}

void MainWindow::onRedo()
{
    if (m_kerningAdjuster) {
        m_kerningAdjuster->redo();
        checkForChanges();
    }
}

void MainWindow::onExportJSON()
{
    if (!m_kerningAdjuster || !m_kerningAdjuster->fontInfo()) {
        QMessageBox::information(this, tr("提示"), tr("请先打开字体文件。"));
        return;
    }

    QString startDir = ConfigManager::instance()->settings().lastExportDirectory;
    if (startDir.isEmpty()) {
        startDir = QStandardPaths::writableLocation(QStandardPaths::DocumentsLocation);
    }

    auto info = m_kerningAdjuster->fontInfo();
    QString defaultName = QStringLiteral("%1_%2_kerning.json")
        .arg(info->familyName)
        .arg(info->styleName);
    defaultName.replace(' ', '_');

    QString fileName = QFileDialog::getSaveFileName(
        this,
        tr("导出为 JSON"),
        startDir + "/" + defaultName,
        tr("JSON 文件 (*.json)")
    );

    if (!fileName.isEmpty()) {
        QFileInfo fi(fileName);
        ConfigManager::instance()->settings().lastExportDirectory = fi.absolutePath();

        m_exporter->exportToJSON(fileName, m_kerningAdjuster, false);
    }
}

void MainWindow::onExportCSV()
{
    if (!m_kerningAdjuster || !m_kerningAdjuster->fontInfo()) {
        QMessageBox::information(this, tr("提示"), tr("请先打开字体文件。"));
        return;
    }

    QString startDir = ConfigManager::instance()->settings().lastExportDirectory;
    if (startDir.isEmpty()) {
        startDir = QStandardPaths::writableLocation(QStandardPaths::DocumentsLocation);
    }

    auto info = m_kerningAdjuster->fontInfo();
    QString defaultName = QStringLiteral("%1_%2_kerning.csv")
        .arg(info->familyName)
        .arg(info->styleName);
    defaultName.replace(' ', '_');

    QString fileName = QFileDialog::getSaveFileName(
        this,
        tr("导出为 CSV"),
        startDir + "/" + defaultName,
        tr("CSV 文件 (*.csv)")
    );

    if (!fileName.isEmpty()) {
        QFileInfo fi(fileName);
        ConfigManager::instance()->settings().lastExportDirectory = fi.absolutePath();

        m_exporter->exportToCSV(fileName, m_kerningAdjuster, false);
    }
}

void MainWindow::onExportFont()
{
    if (!m_kerningAdjuster || !m_kerningAdjuster->fontInfo()) {
        QMessageBox::information(this, tr("提示"), tr("请先打开字体文件。"));
        return;
    }

    QString startDir = ConfigManager::instance()->settings().lastExportDirectory;
    if (startDir.isEmpty()) {
        startDir = QStandardPaths::writableLocation(QStandardPaths::DocumentsLocation);
    }

    auto info = m_kerningAdjuster->fontInfo();
    QString defaultName = QStringLiteral("%1_%2_modified.ttf")
        .arg(info->familyName)
        .arg(info->styleName);
    defaultName.replace(' ', '_');

    QString fileName = QFileDialog::getSaveFileName(
        this,
        tr("导出为字体文件"),
        startDir + "/" + defaultName,
        tr("TrueType 字体 (*.ttf);;OpenType 字体 (*.otf)")
    );

    if (!fileName.isEmpty()) {
        QFileInfo fi(fileName);
        ConfigManager::instance()->settings().lastExportDirectory = fi.absolutePath();

        if (m_exporter->exportToFont(info->filePath, fileName, m_kerningAdjuster)) {
            QMessageBox::information(this, tr("完成"), m_exporter->lastError());
        } else {
            QMessageBox::warning(this, tr("错误"), m_exporter->lastError());
        }
    }
}

void MainWindow::onImportJSON()
{
    if (!m_kerningAdjuster || !m_kerningAdjuster->fontInfo()) {
        QMessageBox::information(this, tr("提示"), tr("请先打开字体文件。"));
        return;
    }

    QString startDir = ConfigManager::instance()->settings().lastExportDirectory;
    if (startDir.isEmpty()) {
        startDir = QStandardPaths::writableLocation(QStandardPaths::DocumentsLocation);
    }

    QString fileName = QFileDialog::getOpenFileName(
        this,
        tr("导入字距数据"),
        startDir,
        tr("JSON 文件 (*.json)")
    );

    if (!fileName.isEmpty()) {
        if (m_exporter->importFromJSON(fileName, m_kerningAdjuster)) {
            QMessageBox::information(this, tr("完成"), tr("字距数据已成功导入。"));
        } else {
            QMessageBox::warning(this, tr("错误"), m_exporter->lastError());
        }
    }
}

void MainWindow::onImportCSV()
{
    if (!m_kerningAdjuster || !m_kerningAdjuster->fontInfo()) {
        QMessageBox::information(this, tr("提示"), tr("请先打开字体文件。"));
        return;
    }

    QString startDir = ConfigManager::instance()->settings().lastExportDirectory;
    if (startDir.isEmpty()) {
        startDir = QStandardPaths::writableLocation(QStandardPaths::DocumentsLocation);
    }

    QString fileName = QFileDialog::getOpenFileName(
        this,
        tr("导入字距数据"),
        startDir,
        tr("CSV 文件 (*.csv)")
    );

    if (!fileName.isEmpty()) {
        if (m_exporter->importFromCSV(fileName, m_kerningAdjuster)) {
            QMessageBox::information(this, tr("完成"), tr("字距数据已成功导入。"));
        } else {
            QMessageBox::warning(this, tr("错误"), m_exporter->lastError());
        }
    }
}

void MainWindow::onSettings()
{
    SettingsDialog dialog(ConfigManager::instance()->settings(), this);
    if (dialog.exec() == QDialog::Accepted) {
        ConfigManager::instance()->save();
    }
}

void MainWindow::onAbout()
{
    QMessageBox::about(
        this,
        tr("关于 Kerning Adjuster"),
        tr("<h3>Kerning Adjuster 字体字距校准工具</h3>"
           "<p>版本 1.0.0</p>"
           "<p>一个跨平台的字体字距调整工具，支持：</p>"
           "<ul>"
           "<li>解析 TrueType (.ttf) 和 OpenType (.otf) 字体</li>"
           "<li>批量调整字符对字距</li>"
           "<li>实时预览调整效果</li>"
           "<li>多字体批量处理</li>"
           "<li>导出 JSON/CSV 格式</li>"
           "<li>支持撤销/重做操作</li>"
           "</ul>"
           "<p><b>使用技术：</b>Qt 5 + FreeType + nlohmann_json</p>")
    );
}

void MainWindow::onExportProgress(int current, int total)
{
    if (m_progressBar) {
        m_progressBar->setVisible(true);
        m_progressBar->setMaximum(total);
        m_progressBar->setValue(current);
    }
}

void MainWindow::onExportFinished(bool success)
{
    if (m_progressBar) {
        m_progressBar->setVisible(false);
    }

    if (success) {
        statusBar()->showMessage(tr("导出完成"), 3000);
    } else {
        QMessageBox::warning(this, tr("导出失败"), m_exporter->lastError());
    }
}

void MainWindow::onAutoKerningRecommendationsApplied(int count)
{
    statusBar()->showMessage(tr("自动校准完成，已应用 %1 个调整").arg(count), 3000);
    checkForChanges();
}

void MainWindow::onUnifiedKerningApplied(const QString& fontPath, int count)
{
    Q_UNUSED(fontPath)
    statusBar()->showMessage(tr("统一校准完成，已应用 %1 个调整").arg(count), 3000);
    checkForChanges();
}
