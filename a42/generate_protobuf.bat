@echo off
protoc --go_out=. --go_opt=paths=source_relative api/audit_event.proto
