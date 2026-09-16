import { randomInt, randomBytes, createHash } from 'node:crypto';

// Short, concrete, easy to say aloud. ~420 words → three words ≈ 26 bits, plus rate limiting.
const WORDS = `
amber apple arrow ash aspen atlas autumn badger bagel bamboo banjo barley basil bay beacon beech
berry birch bison blossom bluff bramble brass breeze brick bridge brook cactus camel canyon canoe
caper carbon cedar chalk cherry cider cinder citrus clay cliff clover cobalt cocoa comet copper
coral cotton cove crane creek cress crocus crystal cumin cypress daisy dawn delta dune dusk eagle
ebony echo elder elk ember falcon fennel fern fig finch fjord flint fox garnet ginger glacier gorse
granite grove hazel heather heron hickory holly honey ibis indigo iris ivory jade jasmine juniper
kelp kestrel kiwi lagoon lark laurel lava lemon lichen lilac lily linen lotus lynx magnet mango
maple marble marsh meadow melon mesa mint mist moss myrtle nectar nettle nickel north nutmeg oak
oasis ocean olive onyx opal orchid osprey otter oyster palm pansy papaya pebble pecan pepper perch
pine plum pollen poplar prairie quartz quill quince raven reef ridge river robin rose rowan ruby
rye saffron sage salmon sand sapphire scarlet sedge sequoia shale silver slate sorrel spruce squid
starling stone storm summit sumac sunset swan tamarind teak thistle thyme tiger timber topaz trout
tulip tundra turnip umber valley vanilla velvet violet walnut walrus wheat willow winter wren yarrow
yew zephyr zinc acorn anchor anvil apron badge ballad banner barrel basket beetle bell birdie biscuit
blanket bobbin bonnet boulder bucket bugle button cabin candle canvas carrot castle cello chapel
cherub chisel cloak coach compass cookie cradle crumpet cupboard dagger dial dolphin donkey dragon
drum dumpling easel engine feather fiddle flute fossil galley garden gazelle goblet goose gravel
hammer hamper harbor harp helmet hermit hinge hobbit jacket jester jigsaw kettle kitten ladder lantern
lattice lever lobster locket lumber mallet mantle marigold mask mirror mitten monkey mortar muffin
napkin needle nomad noodle oboe orbit organ paddle pagoda parcel parrot pastry pedal pelican pencil
penguin pepper piano pickle pillow pirate pistol plank pocket poodle puffin puppet quiver rabbit
racket radish rattle ribbon rocket rudder saddle sailor sandal satchel scarf scooter shovel skate
sketch sleigh slipper spider sponge spoon sprocket stapler steeple stirrup tabby tassel teapot tent
thimble ticket toffee tractor trumpet tunnel turtle velcro violin waffle wagon walnut whisker whistle
window wizard yogurt zebra zipper
`.split(/\s+/).filter(Boolean);

const UNIQUE = Array.from(new Set(WORDS));

export function generatePasscode(): string {
  const pick = () => UNIQUE[randomInt(UNIQUE.length)];
  return `${pick()}-${pick()}-${pick()}`;
}

export function normalisePasscode(input: string): string {
  return input.trim().toLowerCase().replace(/[\s_]+/g, '-').replace(/-+/g, '-');
}

export function newToken(): string {
  return randomBytes(24).toString('base64url');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function newId(): string {
  return randomBytes(12).toString('base64url');
}
