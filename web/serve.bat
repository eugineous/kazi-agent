@echo off
set PORT_NUM=%PORT%
if "%PORT_NUM%"=="" set PORT_NUM=4200
powershell.exe -ExecutionPolicy Bypass -File "%~dp0serve.ps1"
