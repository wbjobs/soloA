cmake_minimum_required(VERSION 3.16)
project(KerningAdjuster VERSION 1.0.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_AUTOMOC ON)
set(CMAKE_AUTORCC ON)
set(CMAKE_AUTOUIC ON)

set(CMAKE_RUNTIME_OUTPUT_DIRECTORY ${CMAKE_BINARY_DIR}/bin)
set(CMAKE_LIBRARY_OUTPUT_DIRECTORY ${CMAKE_BINARY_DIR}/lib)
set(CMAKE_ARCHIVE_OUTPUT_DIRECTORY ${CMAKE_BINARY_DIR}/lib)

find_package(Qt5 REQUIRED COMPONENTS Core Gui Widgets)
find_package(Freetype REQUIRED)
find_package(nlohmann_json QUIET)

if(NOT nlohmann_json_FOUND)
    add_subdirectory(third_party/json)
endif()

set(SOURCES
    src/main.cpp
    src/core/FontParser.cpp
    src/core/KerningAdjuster.cpp
    src/core/KerningPair.cpp
    src/core/HistoryManager.cpp
    src/core/FontManager.cpp
    src/core/AutoKerningAnalyzer.cpp
    src/core/FontComparisonManager.cpp
    src/render/PreviewRenderer.cpp
    src/render/FontRenderer.cpp
    src/io/ConfigManager.cpp
    src/io/Exporter.cpp
    src/ui/MainWindow.cpp
    src/ui/FontListWidget.cpp
    src/ui/KerningTableWidget.cpp
    src/ui/PreviewWidget.cpp
    src/ui/SettingsDialog.cpp
    src/ui/AutoKerningPanel.cpp
    src/ui/FontComparisonPanel.cpp
)

set(HEADERS
    src/core/FontParser.h
    src/core/KerningAdjuster.h
    src/core/KerningPair.h
    src/core/HistoryManager.h
    src/core/FontManager.h
    src/core/AutoKerningAnalyzer.h
    src/core/FontComparisonManager.h
    src/render/PreviewRenderer.h
    src/render/FontRenderer.h
    src/io/ConfigManager.h
    src/io/Exporter.h
    src/ui/MainWindow.h
    src/ui/FontListWidget.h
    src/ui/KerningTableWidget.h
    src/ui/PreviewWidget.h
    src/ui/SettingsDialog.h
    src/ui/AutoKerningPanel.h
    src/ui/FontComparisonPanel.h
)

add_executable(KerningAdjuster ${SOURCES} ${HEADERS})

target_include_directories(KerningAdjuster PRIVATE
    ${CMAKE_SOURCE_DIR}/src
    ${FREETYPE_INCLUDE_DIRS}
)

target_link_libraries(KerningAdjuster PRIVATE
    Qt5::Core
    Qt5::Gui
    Qt5::Widgets
    ${FREETYPE_LIBRARIES}
    nlohmann_json::nlohmann_json
)

if(WIN32)
    set_target_properties(KerningAdjuster PROPERTIES
        WIN32_EXECUTABLE TRUE
    )
endif()

if(APPLE)
    set_target_properties(KerningAdjuster PROPERTIES
        MACOSX_BUNDLE TRUE
        MACOSX_BUNDLE_BUNDLE_NAME "Kerning Adjuster"
        MACOSX_BUNDLE_BUNDLE_VERSION ${PROJECT_VERSION}
        MACOSX_BUNDLE_SHORT_VERSION_STRING ${PROJECT_VERSION}
    )
endif()

install(TARGETS KerningAdjuster
    BUNDLE DESTINATION .
    RUNTIME DESTINATION bin
)
