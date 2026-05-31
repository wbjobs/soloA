#include <QApplication>
#include <QTextCodec>
#include <QLocale>
#include <QTranslator>
#include <QMetaType>

#include "ui/MainWindow.h"
#include "io/ConfigManager.h"
#include "core/KerningPair.h"

int main(int argc, char *argv[])
{
    QApplication app(argc, argv);

    qRegisterMetaType<KerningPair>("KerningPair");

    QCoreApplication::setOrganizationName("KerningAdjuster");
    QCoreApplication::setApplicationName("Kerning Adjuster");
    QCoreApplication::setApplicationVersion("1.0.0");

    QTextCodec::setCodecForLocale(QTextCodec::codecForName("UTF-8"));

    QTranslator translator;
    QString locale = QLocale::system().name();
    if (translator.load(":/translations/kerningadjuster_" + locale)) {
        app.installTranslator(&translator);
    }

    ConfigManager::instance()->load();

    MainWindow window;
    window.show();

    int result = app.exec();

    ConfigManager::instance()->save();

    return result;
}
