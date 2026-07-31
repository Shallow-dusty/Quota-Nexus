param(
    [Parameter(Mandatory = $true, Position = 0)]
    [ValidateSet("dev", "build")]
    [string] $Mode
)

$ErrorActionPreference = "Stop"
$cargoBin = Join-Path $env:USERPROFILE ".cargo\bin"
if (Test-Path -LiteralPath $cargoBin) {
    $env:Path = "$cargoBin;$env:Path"
}

$nativeLink = Get-Command link.exe -ErrorAction SilentlyContinue
$nativeCompiler = Get-Command cl.exe -ErrorAction SilentlyContinue
if (-not $nativeLink -or -not $nativeCompiler) {
    $clang = Get-Command clang-cl.exe -ErrorAction Stop
    $linker = Get-Command lld-link.exe -ErrorAction Stop
    $archiver = Get-Command llvm-lib.exe -ErrorAction Stop
    $env:CARGO_TARGET_X86_64_PC_WINDOWS_MSVC_LINKER = $linker.Source
    $env:CC_x86_64_pc_windows_msvc = $clang.Source
    $env:CXX_x86_64_pc_windows_msvc = $clang.Source
    $env:AR_x86_64_pc_windows_msvc = $archiver.Source
}

& pnpm tauri $Mode
exit $LASTEXITCODE
