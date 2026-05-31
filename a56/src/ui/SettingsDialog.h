#ifndef SETTINGSDIALOG_H
#define SETTINGSDIALOG_H

#include <QDialog>
#include <QVBoxLayout>
#include <QHBoxLayout>
#include <QPushButton>
#include <QCheckBox>
#include <QSpinBox>
#include <QLabel>
#include <QGroupBox>
#include <QDialogButtonBox>

#include "io/ConfigManager.h"

class SettingsDialog : public QDialog
{
    Q_OBJECT
public:
    explicit SettingsDialog(AppSettings& settings, QWidget* parent = nullptr);
    ~SettingsDialog();

    void accept() override;

private:
    AppSettings& m_settings;

    QSpinBox* m_previewFontSizeSpin;
    QSpinBox* m_defaultFontSizeSpin;
    QCheckBox* m_autoSaveCheck;
    QSpinBox* m_autoSaveIntervalSpin;

    void setupUI();
    void loadSettings();
    void saveSettings();
};

#endif
