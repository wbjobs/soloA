#include "ui/SettingsDialog.h"
#include <QFormLayout>

SettingsDialog::SettingsDialog(AppSettings& settings, QWidget* parent)
    : QDialog(parent)
    , m_settings(settings)
{
    setWindowTitle(tr("设置"));
    setMinimumWidth(400);
    setupUI();
    loadSettings();
}

SettingsDialog::~SettingsDialog()
{
}

void SettingsDialog::accept()
{
    saveSettings();
    QDialog::accept();
}

void SettingsDialog::setupUI()
{
    QVBoxLayout* mainLayout = new QVBoxLayout(this);

    QGroupBox* displayGroup = new QGroupBox(tr("显示设置"), this);
    QFormLayout* displayLayout = new QFormLayout(displayGroup);

    m_previewFontSizeSpin = new QSpinBox(this);
    m_previewFontSizeSpin->setRange(12, 200);
    m_previewFontSizeSpin->setSuffix(tr(" 点"));
    displayLayout->addRow(tr("预览字号:"), m_previewFontSizeSpin);

    m_defaultFontSizeSpin = new QSpinBox(this);
    m_defaultFontSizeSpin->setRange(12, 200);
    m_defaultFontSizeSpin->setSuffix(tr(" 点"));
    displayLayout->addRow(tr("默认字号:"), m_defaultFontSizeSpin);

    mainLayout->addWidget(displayGroup);

    QGroupBox* saveGroup = new QGroupBox(tr("保存设置"), this);
    QFormLayout* saveLayout = new QFormLayout(saveGroup);

    m_autoSaveCheck = new QCheckBox(tr("自动保存"), this);
    saveLayout->addRow(tr("自动保存:"), m_autoSaveCheck);

    m_autoSaveIntervalSpin = new QSpinBox(this);
    m_autoSaveIntervalSpin->setRange(1, 60);
    m_autoSaveIntervalSpin->setSuffix(tr(" 分钟"));
    saveLayout->addRow(tr("自动保存间隔:"), m_autoSaveIntervalSpin);

    mainLayout->addWidget(saveGroup);

    QDialogButtonBox* buttonBox = new QDialogButtonBox(
        QDialogButtonBox::Ok | QDialogButtonBox::Cancel,
        this
    );
    connect(buttonBox, &QDialogButtonBox::accepted, this, &SettingsDialog::accept);
    connect(buttonBox, &QDialogButtonBox::rejected, this, &QDialog::reject);

    mainLayout->addWidget(buttonBox);
}

void SettingsDialog::loadSettings()
{
    m_previewFontSizeSpin->setValue(m_settings.previewFontSize);
    m_defaultFontSizeSpin->setValue(m_settings.defaultFontSize);
    m_autoSaveCheck->setChecked(m_settings.autoSave);
    m_autoSaveIntervalSpin->setValue(m_settings.autoSaveInterval);
}

void SettingsDialog::saveSettings()
{
    m_settings.previewFontSize = m_previewFontSizeSpin->value();
    m_settings.defaultFontSize = m_defaultFontSizeSpin->value();
    m_settings.autoSave = m_autoSaveCheck->isChecked();
    m_settings.autoSaveInterval = m_autoSaveIntervalSpin->value();
}
