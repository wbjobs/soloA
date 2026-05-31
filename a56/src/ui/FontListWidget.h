#ifndef FONTLISTWIDGET_H
#define FONTLISTWIDGET_H

#include <QWidget>
#include <QListWidget>
#include <QListWidgetItem>
#include <QVBoxLayout>
#include <QLabel>

#include "core/FontManager.h"

class FontListWidget : public QWidget
{
    Q_OBJECT
public:
    explicit FontListWidget(FontManager* manager, QWidget* parent = nullptr);
    ~FontListWidget();

    QString selectedFontPath() const;
    void selectFont(const QString& filePath);
    void refresh();

signals:
    void fontSelected(const QString& filePath);
    void fontDoubleClicked(const QString& filePath);

private slots:
    void onItemChanged();
    void onItemSelectionChanged();
    void onItemDoubleClicked(QListWidgetItem* item);

private:
    FontManager* m_manager;
    QListWidget* m_listWidget;
    QLabel* m_countLabel;
};

#endif
