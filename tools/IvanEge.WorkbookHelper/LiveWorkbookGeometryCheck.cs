using System.Runtime.InteropServices;
using System.Text.Json.Nodes;

namespace IvanEge.WorkbookHelper;

internal static class LiveWorkbookGeometryCheck
{
    public static async Task<JsonArray> RunAsync(LiveOfficeProcess office,string sheet,CancellationToken token)
    {
        var frames=new JsonArray();
        await office.CommandAsync(new(){["type"]="view",["zoom"]=100,["row"]=0,["column"]=0,["freezeRows"]=0,["freezeColumns"]=0},token);
        var selection=new JsonObject{["sheetName"]=sheet,["ranges"]=new JsonArray(new JsonArray(2,2,3,3)),["objects"]=new JsonArray()};
        var peer=new JsonObject{["name"]="Geometry fixture",["color"]="#009b8f",["selection"]=selection,["draft"]=new JsonObject{["sheetName"]=sheet,["cell"]=new JsonArray(2,2),["text"]="C3"}};
        var first=await office.CommandAsync(new(){["type"]="pulse",["peers"]=new JsonArray(peer.DeepClone())},token);
        long raw=first["window"]!.GetValue<long>(); nint owner=GetAncestor((nint)(raw<0?unchecked((uint)raw):raw),2);
        var placement=new Placement{Length=Marshal.SizeOf<Placement>()};GetWindowPlacement(owner,ref placement);
        try
        {
            foreach(var screen in Screen.AllScreens.Concat(Screen.AllScreens.Take(1)))
            {
                var work=screen.WorkingArea;ShowWindow(owner,9);
                if(!SetWindowPos(owner,0,work.X+40,work.Y+40,Math.Min(1100,work.Width-80),Math.Min(800,work.Height-80),0x14))throw new InvalidOperationException("Could not move owned geometry fixture");
                await Task.Delay(500,token);
                var frame=await office.CommandAsync(new(){["type"]="pulse",["peers"]=new JsonArray(peer.DeepClone())},token);
                if(!GetWindowRect(owner,out var rect))throw new InvalidOperationException("Missing owned window rectangle");
                var view=frame["view"]!.AsArray();var bounds=new Rectangle(view[0]!.GetValue<int>(),view[1]!.GetValue<int>(),view[2]!.GetValue<int>(),view[3]!.GetValue<int>());
                var window=Rectangle.FromLTRB(rect.Left,rect.Top,rect.Right,rect.Bottom);
                // Previously Calc's accessibility viewport extended hundreds of
                // pixels outside the real window on the 100% secondary screen.
                if(!Rectangle.Inflate(window,3,3).Contains(bounds)||frame["marks"]!.AsArray().Count<2)throw new InvalidOperationException("Peer geometry is outside the physical workbook window: "+frame);
                frames.Add(new JsonObject{["screen"]=screen.DeviceName,["window"]=new JsonArray(rect.Left,rect.Top,rect.Right,rect.Bottom),["frame"]=frame.DeepClone()});
            }
        }
        finally{SetWindowPlacement(owner,ref placement);}
        return frames;
    }
    [StructLayout(LayoutKind.Sequential)]private struct Point{public int X,Y;}
    [StructLayout(LayoutKind.Sequential)]private struct Rect{public int Left,Top,Right,Bottom;}
    [StructLayout(LayoutKind.Sequential)]private struct Placement{public int Length,Flags,Show;public Point Min,Max;public Rect Normal;}
    [DllImport("user32.dll")]private static extern nint GetAncestor(nint window,uint flags);
    [DllImport("user32.dll")]private static extern bool GetWindowRect(nint window,out Rect rect);
    [DllImport("user32.dll")]private static extern bool SetWindowPos(nint window,nint after,int x,int y,int width,int height,uint flags);
    [DllImport("user32.dll")]private static extern bool ShowWindow(nint window,int command);
    [DllImport("user32.dll")]private static extern bool GetWindowPlacement(nint window,ref Placement placement);
    [DllImport("user32.dll")]private static extern bool SetWindowPlacement(nint window,ref Placement placement);
}
