using System.Runtime.InteropServices;

namespace IvanEge.WorkbookHelper;

internal static class PackageIdentity
{
    private const int ErrorInsufficientBuffer = 122;
    private const int AppModelErrorNoPackage = 15700;

    public static bool IsPackaged
    {
        get
        {
            uint length = 0;
            var result = GetCurrentPackageFullName(ref length, null);
            return result switch
            {
                0 or ErrorInsufficientBuffer => true,
                AppModelErrorNoPackage => false,
                _ => false
            };
        }
    }

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode)]
    private static extern int GetCurrentPackageFullName(
        ref uint packageFullNameLength,
        char[]? packageFullName);
}
