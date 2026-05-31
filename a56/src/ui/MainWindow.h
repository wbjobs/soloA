#ifndef MAINWINDOW_H
#define MAINWINDOW_H

#include <QMainWindow>
#include <QSplitter>
#include <QTabWidget>
#include <QStatusBar>
#include <QToolBar>
#include <QMenuBar>
#include <QAction>
#include <QFileDialog>
#include <QMessageBox>
#include <QProgressBar>

#include "core/FontManager.h"
#include "core/KerningAdjuster.h"
#include "render/PreviewRenderer.h"
#include "io/Exporter.h"
#include "io/ConfigManager.h"

#include "ui/FontListWidget.h"
#include "ui/KerningTableWidget.h"
#include "ui/PreviewWidget.h"
#include "ui/AutoKerningPanel.h"
#include "ui/FontComparisonPanel.h"

class MainWindow : public QMainWindow
{
    Q_OBJECT
public:
    explicit MainWindow(QWidget* parent = nullptr);
    ~MainWindow();

protected:
    void closeEvent(QCloseEvent* event) override;

private slots:
    void onOpenFont();
    void onOpenFontFolder();
    void onExportJSON();
    void onExportCSV();
    void onExportFont();
    void onImportJSON();
    void onImportCSV();
    void onSettings();
    void onAbout();

    void onFontSelected(const QString& filePath);
    void onFontChanged(const QList<KerningPair>& pairs);

    void onUndo();
    void onRedo();

    void onExportFinished(bool success);
    void onExportProgress(int current, int total);

    void onAutoKerningRecommendationsApplied(int count);
    void onUnifiedKerningApplied(const QString& fontPath, int count);

private:
    FontManager* m_fontManager;
    KerningAdjuster* m_kerningAdjuster;
    PreviewRenderer* m_previewRenderer;
    Exporter* m_exporter;

    FontListWidget* m_fontListWidget;
    KerningTableWidget* m_kerningTableWidget;
    PreviewWidget* m_previewWidget;
    AutoKerningPanel* m_autoKerningPanel;
    FontComparisonPanel* m_comparisonPanel;

    QTabWidget* m_mainTabWidget;

    QAction* m_undoAction;
    QAction* m_redoAction;

    QProgressBar* m_progressBar;

    void setupUI();
    void setupMenuBar();
    void setupToolBar();
    void setupStatusBar();
    void updateActions();
    void updateStatus();
    void checkForChanges();
};

#endif
