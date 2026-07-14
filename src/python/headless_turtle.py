"""A small, browser-friendly subset of :mod:`turtle` for the Pyodide runner.

The real turtle module depends on Tk, which is unavailable inside a Web Worker.
This module records drawing primitives instead. JavaScript reads the scene with
``_turtle_export_scene_json`` after the student's program has finished.
"""

import json as _json
import math as _math
import sys as _sys
import types as _types


_MAX_PRIMITIVES = 20_000
_MAX_POLYGON_POINTS = 20_000
_MAX_TEXT_LENGTH = 500
_MAX_ABS_COORDINATE = 1_000_000_000.0
_MAX_SIZE = 100_000.0


def _number(value, default=0.0, limit=_MAX_ABS_COORDINATE):
    try:
        result = float(value)
    except (TypeError, ValueError, OverflowError):
        return float(default)
    if not _math.isfinite(result):
        return float(default)
    return max(-limit, min(limit, result))


def _compact_number(value):
    result = round(_number(value), 6)
    return int(result) if result.is_integer() else result


class _Scene:
    def __init__(self):
        self.width = 800.0
        self.height = 600.0
        self.background = "white"
        self.world = None
        self.color_mode = 1.0
        self.primitives = []
        self.truncated = False
        self.used = False
        self._turtles = []

    def touch(self):
        self.used = True

    def add(self, primitive):
        self.used = True
        if len(self.primitives) >= _MAX_PRIMITIVES:
            self.truncated = True
            return
        self.primitives.append(primitive)

    def clear(self):
        self.touch()
        self.primitives.clear()
        self.truncated = False

    def color(self, *values):
        if len(values) == 1:
            value = values[0]
            if isinstance(value, str):
                return value[:128] or "black"
            if isinstance(value, (tuple, list)):
                values = tuple(value)
            else:
                return str(value)[:128] or "black"
        if len(values) >= 3:
            scale = 255.0 if self.color_mode == 255.0 else 1.0
            channels = []
            for value in values[:3]:
                channel = _number(value, 0.0, 255.0)
                if scale == 1.0:
                    channel *= 255.0
                channels.append(max(0, min(255, int(round(channel)))))
            return "rgb({},{},{})".format(*channels)
        return "black"

    def export(self):
        if not self.used and not self.primitives:
            return None
        return {
            "version": 1,
            "used": bool(self.used),
            "width": _compact_number(self.width),
            "height": _compact_number(self.height),
            "background": self.background,
            "world": self.world,
            "primitives": self.primitives,
            "truncated": bool(self.truncated),
            "limit": _MAX_PRIMITIVES,
        }


_scene = _Scene()


class _Turtle:
    def __init__(self, *args, **kwargs):
        self._x = 0.0
        self._y = 0.0
        self._heading = 0.0
        self._fullcircle = 360.0
        self._pen_down = True
        self._pen_color = "black"
        self._fill_color = "black"
        self._pen_width = 1.0
        self._fill_points = None
        self._visible = True
        self._speed = 3
        self._shape = "classic"
        _scene._turtles.append(self)

    def _to_degrees(self, angle):
        return _number(angle) * 360.0 / self._fullcircle

    def _from_degrees(self, angle):
        return _number(angle) * self._fullcircle / 360.0

    def _point(self):
        return [_compact_number(self._x), _compact_number(self._y)]

    def _move_to(self, x, y):
        new_x = _number(x)
        new_y = _number(y)
        if self._pen_down:
            _scene.add({
                "type": "line",
                "x1": _compact_number(self._x),
                "y1": _compact_number(self._y),
                "x2": _compact_number(new_x),
                "y2": _compact_number(new_y),
                "color": self._pen_color,
                "width": _compact_number(self._pen_width),
            })
        else:
            _scene.touch()
        self._x = new_x
        self._y = new_y
        if self._fill_points is not None:
            if len(self._fill_points) < _MAX_POLYGON_POINTS:
                self._fill_points.append(self._point())
            else:
                _scene.truncated = True

    def forward(self, distance):
        distance = _number(distance)
        radians = _math.radians(self._heading)
        self._move_to(
            self._x + _math.cos(radians) * distance,
            self._y + _math.sin(radians) * distance,
        )

    fd = forward

    def backward(self, distance):
        self.forward(-_number(distance))

    back = backward
    bk = backward

    def right(self, angle):
        _scene.touch()
        self._heading = (self._heading - self._to_degrees(angle)) % 360.0

    rt = right

    def left(self, angle):
        _scene.touch()
        self._heading = (self._heading + self._to_degrees(angle)) % 360.0

    lt = left

    def goto(self, x, y=None):
        if y is None:
            try:
                x, y = x
            except (TypeError, ValueError):
                y = self._y
        self._move_to(x, y)

    setpos = goto
    setposition = goto

    def setx(self, x):
        self._move_to(x, self._y)

    def sety(self, y):
        self._move_to(self._x, y)

    def setheading(self, angle):
        _scene.touch()
        self._heading = self._to_degrees(angle) % 360.0

    seth = setheading

    def home(self):
        self._move_to(0.0, 0.0)
        self._heading = 0.0

    def circle(self, radius, extent=None, steps=None):
        radius = _number(radius)
        if radius == 0:
            return
        sweep = 360.0 if extent is None else self._to_degrees(extent)
        if radius < 0:
            sweep = -sweep
        heading_radians = _math.radians(self._heading)
        center_x = self._x - _math.sin(heading_radians) * radius
        center_y = self._y + _math.cos(heading_radians) * radius
        start_angle = _math.atan2(self._y - center_y, self._x - center_x)
        if steps is None:
            arc_length = abs(_math.radians(sweep) * radius)
            segment_count = max(1, min(720, int(_math.ceil(arc_length / 4.0))))
        else:
            segment_count = max(1, min(720, int(abs(_number(steps, 1, 720)))))
        sweep_radians = _math.radians(sweep)
        for index in range(1, segment_count + 1):
            angle = start_angle + sweep_radians * index / segment_count
            self._move_to(
                center_x + abs(radius) * _math.cos(angle),
                center_y + abs(radius) * _math.sin(angle),
            )
        self._heading = (self._heading + sweep) % 360.0

    def dot(self, size=None, *color):
        dot_size = max(
            1.0,
            min(_MAX_SIZE, _number(size, max(self._pen_width + 4, self._pen_width * 2), _MAX_SIZE)),
        )
        dot_color = _scene.color(*color) if color else self._pen_color
        _scene.add({
            "type": "dot",
            "x": _compact_number(self._x),
            "y": _compact_number(self._y),
            "size": _compact_number(dot_size),
            "color": dot_color,
        })

    def stamp(self):
        self.dot(max(8.0, self._pen_width * 2), self._pen_color)
        return len(_scene.primitives)

    def clearstamp(self, stampid):
        _scene.touch()

    def clearstamps(self, n=None):
        _scene.touch()

    def undo(self):
        if _scene.primitives:
            _scene.primitives.pop()
        _scene.touch()

    def speed(self, value=None):
        if value is None:
            return self._speed
        self._speed = value
        _scene.touch()

    def position(self):
        return (self._x, self._y)

    pos = position

    def towards(self, x, y=None):
        if y is None:
            x, y = x
        angle = _math.degrees(_math.atan2(_number(y) - self._y, _number(x) - self._x))
        return self._from_degrees(angle % 360.0)

    def xcor(self):
        return self._x

    def ycor(self):
        return self._y

    def heading(self):
        return self._from_degrees(self._heading)

    def distance(self, x, y=None):
        if y is None:
            try:
                x, y = x.position()
            except AttributeError:
                x, y = x
        return _math.hypot(_number(x) - self._x, _number(y) - self._y)

    def degrees(self, fullcircle=360.0):
        fullcircle = abs(_number(fullcircle, 360.0))
        self._fullcircle = fullcircle or 360.0
        _scene.touch()

    def radians(self):
        self.degrees(2.0 * _math.pi)

    def pendown(self):
        self._pen_down = True
        _scene.touch()

    pd = pendown
    down = pendown

    def penup(self):
        self._pen_down = False
        _scene.touch()

    pu = penup
    up = penup

    def isdown(self):
        return self._pen_down

    def pensize(self, width=None):
        if width is None:
            return self._pen_width
        self._pen_width = max(0.1, min(_MAX_SIZE, abs(_number(width, 1.0, _MAX_SIZE))))
        _scene.touch()

    width = pensize

    def pencolor(self, *args):
        if not args:
            return self._pen_color
        self._pen_color = _scene.color(*args)
        _scene.touch()
        return self._pen_color

    def fillcolor(self, *args):
        if not args:
            return self._fill_color
        self._fill_color = _scene.color(*args)
        _scene.touch()
        return self._fill_color

    def color(self, *args):
        if not args:
            return (self._pen_color, self._fill_color)
        if len(args) in (1, 3):
            color = _scene.color(*args)
            self._pen_color = color
            self._fill_color = color
        else:
            self._pen_color = _scene.color(args[0])
            self._fill_color = _scene.color(args[1])
        _scene.touch()
        return (self._pen_color, self._fill_color)

    def pen(self, pen=None, **pendict):
        if pen is None and not pendict:
            return {
                "shown": self._visible,
                "pendown": self._pen_down,
                "pencolor": self._pen_color,
                "fillcolor": self._fill_color,
                "pensize": self._pen_width,
                "speed": self._speed,
            }
        settings = {}
        if isinstance(pen, dict):
            settings.update(pen)
        settings.update(pendict)
        if "pendown" in settings:
            self._pen_down = bool(settings["pendown"])
        if "pencolor" in settings:
            self.pencolor(settings["pencolor"])
        if "fillcolor" in settings:
            self.fillcolor(settings["fillcolor"])
        if "pensize" in settings:
            self.pensize(settings["pensize"])
        if "speed" in settings:
            self.speed(settings["speed"])
        if "shown" in settings:
            self._visible = bool(settings["shown"])
        _scene.touch()

    def begin_fill(self):
        self._fill_points = [self._point()]
        _scene.touch()

    def end_fill(self):
        points = self._fill_points
        self._fill_points = None
        if points and len(points) >= 3:
            _scene.add({
                "type": "polygon",
                "points": points,
                "fill": self._fill_color,
                "outline": self._pen_color,
                "width": _compact_number(self._pen_width),
            })
        else:
            _scene.touch()

    def filling(self):
        return self._fill_points is not None

    def reset(self):
        _scene.clear()
        self.__init__()

    def clear(self):
        _scene.clear()

    def write(self, arg, move=False, align="left", font=("Arial", 8, "normal")):
        _scene.add({
            "type": "text",
            "x": _compact_number(self._x),
            "y": _compact_number(self._y),
            "text": str(arg)[:_MAX_TEXT_LENGTH],
            "color": self._pen_color,
            "align": str(align)[:16],
            "font": list(font) if isinstance(font, (tuple, list)) else str(font)[:128],
        })
        if move:
            self._move_to(self._x + max(1, len(str(arg))) * 6, self._y)

    def showturtle(self):
        self._visible = True
        _scene.touch()

    st = showturtle

    def hideturtle(self):
        self._visible = False
        _scene.touch()

    ht = hideturtle

    def isvisible(self):
        return self._visible

    def shape(self, name=None):
        if name is None:
            return self._shape
        self._shape = str(name)
        _scene.touch()

    def resizemode(self, rmode=None):
        return "noresize" if rmode is None else None

    def shapesize(self, stretch_wid=None, stretch_len=None, outline=None):
        return (1.0, 1.0, 1) if stretch_wid is None else None

    turtlesize = shapesize

    def shearfactor(self, shear=None):
        return 0.0 if shear is None else None

    def settiltangle(self, angle):
        _scene.touch()

    def tiltangle(self, angle=None):
        return 0.0 if angle is None else None

    def tilt(self, angle):
        _scene.touch()

    def shapetransform(self, *args):
        return (1.0, 0.0, 0.0, 1.0) if not args else None

    def get_shapepoly(self):
        return ((0, 0),)

    def setundobuffer(self, size):
        _scene.touch()

    def undobufferentries(self):
        return 0

    def clone(self):
        clone = _Turtle()
        clone._x = self._x
        clone._y = self._y
        clone._heading = self._heading
        clone._fullcircle = self._fullcircle
        clone._pen_down = self._pen_down
        clone._pen_color = self._pen_color
        clone._fill_color = self._fill_color
        clone._pen_width = self._pen_width
        clone._visible = self._visible
        clone._speed = self._speed
        return clone

    def getscreen(self):
        return _screen

    def getturtle(self):
        return self

    getpen = getturtle

    # Event handlers are intentionally inert inside a non-interactive worker.
    def onclick(self, fun, btn=1, add=None):
        _scene.touch()

    def onrelease(self, fun, btn=1, add=None):
        _scene.touch()

    def ondrag(self, fun, btn=1, add=None):
        _scene.touch()


class _Screen:
    def screensize(self, canvwidth=None, canvheight=None, bg=None):
        if canvwidth is None and canvheight is None and bg is None:
            return (_scene.width, _scene.height)
        if canvwidth is not None:
            _scene.width = max(1.0, min(_MAX_SIZE, abs(_number(canvwidth, 800, _MAX_SIZE))))
        if canvheight is not None:
            _scene.height = max(1.0, min(_MAX_SIZE, abs(_number(canvheight, 600, _MAX_SIZE))))
        if bg is not None:
            _scene.background = _scene.color(bg)
        _scene.touch()
        return (_scene.width, _scene.height)

    def setup(self, width=None, height=None, startx=None, starty=None):
        if width is not None and abs(_number(width)) > 1:
            _scene.width = max(1.0, min(_MAX_SIZE, abs(_number(width, 800, _MAX_SIZE))))
        if height is not None and abs(_number(height)) > 1:
            _scene.height = max(1.0, min(_MAX_SIZE, abs(_number(height, 600, _MAX_SIZE))))
        _scene.touch()

    def bgcolor(self, *args):
        if not args:
            return _scene.background
        _scene.background = _scene.color(*args)
        _scene.touch()
        return _scene.background

    def colormode(self, cmode=None):
        if cmode is None:
            return _scene.color_mode
        _scene.color_mode = 255.0 if _number(cmode, 1.0) == 255.0 else 1.0
        _scene.touch()

    def setworldcoordinates(self, llx, lly, urx, ury):
        values = [_compact_number(value) for value in (llx, lly, urx, ury)]
        if values[0] != values[2] and values[1] != values[3]:
            _scene.world = values
        _scene.touch()

    def window_width(self):
        return int(_scene.width)

    def window_height(self):
        return int(_scene.height)

    def tracer(self, n=None, delay=None):
        _scene.touch()
        return None

    def delay(self, delay=None):
        _scene.touch()
        return 0 if delay is None else None

    def update(self):
        _scene.touch()

    def title(self, titlestring):
        _scene.touch()

    def mode(self, mode=None):
        return "standard" if mode is None else None

    def bye(self):
        _scene.touch()

    def exitonclick(self):
        _scene.touch()

    def mainloop(self):
        _scene.touch()

    done = mainloop

    def clearscreen(self):
        _scene.clear()

    resetscreen = clearscreen

    def getcanvas(self):
        return None

    def turtles(self):
        return list(_scene._turtles)

    def listen(self, *args, **kwargs):
        _scene.touch()

    def onkey(self, *args, **kwargs):
        _scene.touch()

    onkeypress = onkey
    onkeyrelease = onkey
    onscreenclick = onkey
    onclick = onkey
    ontimer = onkey

    def textinput(self, title, prompt):
        return None

    def numinput(self, title, prompt, default=None, minval=None, maxval=None):
        return default

    def register_shape(self, name, shape=None):
        _scene.touch()

    addshape = register_shape

    def getshapes(self):
        return ["arrow", "turtle", "circle", "square", "triangle", "classic"]

    def bgpic(self, picname=None):
        return "nopic" if picname is None else None


_screen = _Screen()
_default_turtle = _Turtle()


def Screen():
    _scene.touch()
    return _screen


def _bind_default(name):
    return getattr(_default_turtle, name)


_turtle_module = _types.ModuleType("turtle")
_turtle_module.__doc__ = "Headless turtle compatibility layer for the browser code runner."

_turtle_names = [
    "forward", "fd", "backward", "back", "bk", "right", "rt", "left", "lt",
    "goto", "setpos", "setposition", "setx", "sety", "setheading", "seth", "home",
    "circle", "dot", "stamp", "clearstamp", "clearstamps", "undo", "speed",
    "position", "pos", "towards", "xcor", "ycor", "heading", "distance", "degrees",
    "radians", "pendown", "pd", "down", "penup", "pu", "up", "isdown", "pensize",
    "width", "pencolor", "fillcolor", "color", "pen", "begin_fill", "end_fill",
    "filling", "reset", "clear", "write", "showturtle", "st", "hideturtle", "ht",
    "isvisible", "shape", "resizemode", "shapesize", "turtlesize", "shearfactor",
    "settiltangle", "tiltangle", "tilt", "shapetransform", "get_shapepoly",
    "setundobuffer", "undobufferentries", "clone", "getscreen", "getturtle", "getpen",
    "onclick", "onrelease", "ondrag",
]
for _name in _turtle_names:
    setattr(_turtle_module, _name, _bind_default(_name))

_screen_names = [
    "screensize", "setup", "bgcolor", "colormode", "setworldcoordinates", "window_width",
    "window_height", "tracer", "delay", "update", "title", "mode", "bye", "exitonclick",
    "mainloop", "done", "clearscreen", "resetscreen", "getcanvas", "turtles", "listen",
    "onkey", "onkeypress", "onkeyrelease", "onscreenclick", "ontimer", "textinput",
    "numinput", "register_shape", "addshape", "getshapes", "bgpic",
]
for _name in _screen_names:
    setattr(_turtle_module, _name, getattr(_screen, _name))

_turtle_module.Screen = Screen
_turtle_module.Turtle = _Turtle
_turtle_module.RawTurtle = _Turtle
_turtle_module.Pen = _Turtle
_turtle_module.RawPen = _Turtle
_turtle_module.TurtleScreen = _Screen
_turtle_module.ScrolledCanvas = object
_turtle_module.TurtleGraphicsError = ValueError
_turtle_module.Vec2D = tuple
_turtle_module.__all__ = sorted(set(
    _turtle_names
    + _screen_names
    + ["Screen", "Turtle", "RawTurtle", "Pen", "RawPen", "TurtleScreen", "TurtleGraphicsError", "Vec2D"]
))
_sys.modules["turtle"] = _turtle_module


def _turtle_export_scene_json():
    scene = _scene.export()
    return "" if scene is None else _json.dumps(scene, ensure_ascii=False, separators=(",", ":"))
