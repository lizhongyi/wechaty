/**
 *   Wechaty - https://github.com/chatie/wechaty
 *
 *   @copyright 2016-2018 Huan LI <zixia@zixia.net>
 *
 *   Licensed under the Apache License, Version 2.0 (the "License");
 *   you may not use this file except in compliance with the License.
 *   You may obtain a copy of the License at
 *
 *       http://www.apache.org/licenses/LICENSE-2.0
 *
 *   Unless required by applicable law or agreed to in writing, software
 *   distributed under the License is distributed on an "AS IS" BASIS,
 *   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *   See the License for the specific language governing permissions and
 *   limitations under the License.
 *
 *   @ignore
 */
import {
  // config,
  Raven,
  Sayable,
  log,
}                       from '../config'

import {
  Contact,
  Gender,
}                       from '../puppet/'

import Misc             from '../misc'

import PuppetPuppeteer  from './puppet-puppeteer'
import PuppeteerMessage from './puppeteer-message'

export interface PuppeteerContactObj {
  address:    string,
  city:       string,
  id:         string,
  name:       string,
  province:   string,
  alias:      string|null,
  sex:        Gender,
  signature:  string,
  star:       boolean,
  stranger:   boolean,
  uin:        string,
  weixin:     string,
  avatar:     string,  // XXX URL of HeadImgUrl
  official:   boolean,
  special:    boolean,
}

export interface PuppeteerContactRawObj {
  Alias:        string,
  City:         string,
  NickName:     string,
  Province:     string,
  RemarkName:   string,
  Sex:          Gender,
  Signature:    string,
  StarFriend:   string,
  Uin:          string,
  UserName:     string,
  HeadImgUrl:   string,

  stranger:     string, // assign by injectio.js
  VerifyFlag:   number,
}

/**
 * @see https://github.com/Chatie/webwx-app-tracker/blob/7c59d35c6ea0cff38426a4c5c912a086c4c512b2/formatted/webwxApp.js#L3848
 * @ignore
 */
const specialContactList: string[] = [
  'weibo', 'qqmail', 'fmessage', 'tmessage', 'qmessage', 'qqsync', 'floatbottle',
  'lbsapp', 'shakeapp', 'medianote', 'qqfriend', 'readerapp', 'blogapp', 'facebookapp',
  'masssendapp', 'meishiapp', 'feedsapp', 'voip', 'blogappweixin', 'weixin', 'brandsessionholder',
  'weixinreminder', 'wxid_novlwrv3lqwv11', 'gh_22b87fa7cb3c', 'officialaccounts', 'notification_messages',
]

/**
 * All wechat contacts(friend) will be encapsulated as a Contact.
 *
 * `Contact` is `Sayable`,
 * [Examples/Contact-Bot]{@link https://github.com/Chatie/wechaty/blob/master/examples/contact-bot.ts}
 */
export class PuppeteerContact extends Contact implements Sayable {

  private obj?: PuppeteerContactObj
  // private dirtyObj: ContactObj | null
  private rawObj: PuppeteerContactRawObj

  /**
   * @private
   */
  constructor(
    public readonly id: string,
  ) {
    super(id)
    log.silly('PuppeteerContact', `constructor(${id})`)

    if (typeof id !== 'string') {
      throw new Error('id must be string. found: ' + typeof id)
    }
  }

  /**
   * @private
   */
  public toString(): string {
    if (!this.obj) {
      return `PuppeteerContact<this.id>`
    }
    const obj  = this.obj
    const name = obj.alias || obj.name || this.id
    return `PuppeteerContact<${name}>`
  }

  /**
   * @private
   */
  public toStringEx() { return `PuppeteerContact(${this.obj && this.obj.name}[${this.id}])` }

  /**
   * @private
   */
  private parse(rawObj: PuppeteerContactRawObj): PuppeteerContactObj | undefined {
    if (!rawObj || !rawObj.UserName) {
      log.warn('PuppeteerContact', 'parse() got empty rawObj!')
      return undefined
    }

    return !rawObj ? undefined : {
      id:         rawObj.UserName, // MMActualSender??? MMPeerUserName??? `getUserContact(message.MMActualSender,message.MMPeerUserName).HeadImgUrl`
      uin:        rawObj.Uin,    // stable id: 4763975 || getCookie("wxuin")
      weixin:     rawObj.Alias,  // Wechat ID
      name:       rawObj.NickName,
      alias:      rawObj.RemarkName,
      sex:        rawObj.Sex,
      province:   rawObj.Province,
      city:       rawObj.City,
      signature:  rawObj.Signature,

      address:    rawObj.Alias, // XXX: need a stable address for user

      star:       !!rawObj.StarFriend,
      stranger:   !!rawObj.stranger, // assign by injectio.js
      avatar:     rawObj.HeadImgUrl,
      /**
       * @see 1. https://github.com/Chatie/webwx-app-tracker/blob/7c59d35c6ea0cff38426a4c5c912a086c4c512b2/formatted/webwxApp.js#L3243
       * @see 2. https://github.com/Urinx/WeixinBot/blob/master/README.md
       * @ignore
       */
      // tslint:disable-next-line
      official:      !!rawObj.UserName && !rawObj.UserName.startsWith('@@') && !!(rawObj.VerifyFlag & 8),
      /**
       * @see 1. https://github.com/Chatie/webwx-app-tracker/blob/7c59d35c6ea0cff38426a4c5c912a086c4c512b2/formatted/webwxApp.js#L3246
       * @ignore
       */
      special:       specialContactList.indexOf(rawObj.UserName) > -1 || /@qqim$/.test(rawObj.UserName),
    }
  }

  /**
   * The way to search Contact
   *
   * @typedef    ContactQueryFilter
   * @property   {string} name    - The name-string set by user-self, should be called name
   * @property   {string} alias   - The name-string set by bot for others, should be called alias
   * [More Detail]{@link https://github.com/Chatie/wechaty/issues/365}
   */

  /**
   * Sent Text to contact
   *
   * @param {string} text
   */
  public async say(text: string): Promise<void>

  /**
   * Send Media File to Contact
   *
   * @param {MediaMessage} mediaMessage
   * @memberof Contact
   */
  public async say(message: PuppeteerMessage): Promise<void>

  /**
   * Send Text or Media File to Contact.
   *
   * @param {(string | MediaMessage)} textOrMessage
   * @returns {Promise<boolean>}
   * @example
   * const contact = await Contact.find({name: 'lijiarui'})         // change 'lijiarui' to any of your contact name in wechat
   * await contact.say('welcome to wechaty!')
   * await contact.say(new MediaMessage(__dirname + '/wechaty.png') // put the filePath you want to send here
   */
  public async say(textOrMessage: string | PuppeteerMessage): Promise<void> {
    log.verbose('PuppeteerContact', 'say(%s)', textOrMessage)

    const user = this.puppet.userSelf()

    if (!user) {
      throw new Error('no user')
    }

    let m
    if (typeof textOrMessage === 'string') {
      m = new PuppeteerMessage()
      m.puppet = this.puppet

      m.text(textOrMessage)
    } else if (textOrMessage instanceof PuppeteerMessage) {
      m = textOrMessage
    } else {
      throw new Error('not support args')
    }
    m.from(user)
    m.to(this)
    log.silly('PuppeteerContact', 'say() from: %s to: %s content: %s', user.name(), this.name(), textOrMessage)

    return await this.puppet.send(m)
  }

  /**
   * Get the name from a contact
   *
   * @returns {string}
   * @example
   * const name = contact.name()
   */
  public name()     { return Misc.plainText(this.obj && this.obj.name || '') }

  public alias(): string | null

  public alias(newAlias: string): Promise<void>

  public alias(empty: null): Promise<void>

  /**
   * GET / SET / DELETE the alias for a contact
   *
   * Tests show it will failed if set alias too frequently(60 times in one minute).
   * @param {(none | string | null)} newAlias
   * @returns {(string | null | Promise<boolean>)}
   * @example <caption> GET the alias for a contact, return {(string | null)}</caption>
   * const alias = contact.alias()
   * if (alias === null) {
   *   console.log('You have not yet set any alias for contact ' + contact.name())
   * } else {
   *   console.log('You have already set an alias for contact ' + contact.name() + ':' + alias)
   * }
   *
   * @example <caption>SET the alias for a contact</caption>
   * const ret = await contact.alias('lijiarui')
   * if (ret) {
   *   console.log(`change ${contact.name()}'s alias successfully!`)
   * } else {
   *   console.log(`failed to change ${contact.name()} alias!`)
   * }
   *
   * @example <caption>DELETE the alias for a contact</caption>
   * const ret = await contact.alias(null)
   * if (ret) {
   *   console.log(`delete ${contact.name()}'s alias successfully!`)
   * } else {
   *   console.log(`failed to delete ${contact.name()}'s alias!`)
   * }
   */
  public alias(newAlias?: string|null): Promise<void> | string | null {
    // log.silly('PuppeteerContact', 'alias(%s)', newAlias || '')

    if (typeof newAlias === 'undefined') {
      return this.obj && this.obj.alias || null
    }

    const future = this.puppet.contactAlias(this, newAlias)

    future
    .then(() => {
      if (this.obj) {
        this.obj.alias = newAlias
      } else {
        log.error('PuppeteerContact', 'alias() without this.obj?')
      }
    })
    .catch(e => {
      log.error('PuppeteerContact', 'alias(%s) rejected: %s', newAlias, e.message)
      Raven.captureException(e)
    })

    return future
  }

  /**
   * Check if contact is stranger
   *
   * @returns {boolean | null} - True for not friend of the bot, False for friend of the bot, null for unknown.
   * @example
   * const isStranger = contact.stranger()
   */
  public stranger(): boolean|null {
    if (!this.obj) return null
    return this.obj.stranger
  }

  /**
   * Check if it's a offical account
   *
   * @returns {boolean|null} - True for official account, Flase for contact is not a official account, null for unknown
   * @see {@link https://github.com/Chatie/webwx-app-tracker/blob/7c59d35c6ea0cff38426a4c5c912a086c4c512b2/formatted/webwxApp.js#L3243|webwxApp.js#L324}
   * @see {@link https://github.com/Urinx/WeixinBot/blob/master/README.md|Urinx/WeixinBot/README}
   * @example
   * const isOfficial = contact.official()
   */
  public official(): boolean {
    return !!this.obj && this.obj.official
  }

  /**
   * Check if it's a special contact
   *
   * The contact who's id in following list will be identify as a special contact
   * `weibo`, `qqmail`, `fmessage`, `tmessage`, `qmessage`, `qqsync`, `floatbottle`,
   * `lbsapp`, `shakeapp`, `medianote`, `qqfriend`, `readerapp`, `blogapp`, `facebookapp`,
   * `masssendapp`, `meishiapp`, `feedsapp`, `voip`, `blogappweixin`, `weixin`, `brandsessionholder`,
   * `weixinreminder`, `wxid_novlwrv3lqwv11`, `gh_22b87fa7cb3c`, `officialaccounts`, `notification_messages`,
   *
   * @see {@link https://github.com/Chatie/webwx-app-tracker/blob/7c59d35c6ea0cff38426a4c5c912a086c4c512b2/formatted/webwxApp.js#L3848|webwxApp.js#L3848}
   * @see {@link https://github.com/Chatie/webwx-app-tracker/blob/7c59d35c6ea0cff38426a4c5c912a086c4c512b2/formatted/webwxApp.js#L3246|webwxApp.js#L3246}
   * @returns {boolean|null} True for brand, Flase for contact is not a brand
   * @example
   * const isSpecial = contact.special()
   */
  public special(): boolean {
    return !!this.obj && this.obj.special
  }

  /**
   * Check if it's a personal account
   *
   * @returns {boolean|null} - True for personal account, Flase for contact is not a personal account
   * @example
   * const isPersonal = contact.personal()
   */
  public personal(): boolean {
    return !this.official()
  }

  /**
   * Check if the contact is star contact.
   *
   * @returns {boolean} - True for star friend, False for no star friend.
   * @example
   * const isStar = contact.star()
   */
  public star(): boolean|null {
    if (!this.obj) return null
    return this.obj.star
  }

  /**
   * Contact gender
   *
   * @returns {Gender.Male(2)|Gender.Female(1)|Gender.Unknown(0)}
   * @example
   * const gender = contact.gender()
   */
  public gender(): Gender   { return this.obj ? this.obj.sex : Gender.Unknown }

  /**
   * Get the region 'province' from a contact
   *
   * @returns {string | undefined}
   * @example
   * const province = contact.province()
   */
  public province() {
    return this.obj && this.obj.province || null
  }

  /**
   * Get the region 'city' from a contact
   *
   * @returns {string | undefined}
   * @example
   * const city = contact.city()
   */
  public city() {
    return this.obj && this.obj.city || null
  }

  /**
   * Get avatar picture file stream
   *
   * @returns {Promise<NodeJS.ReadableStream>}
   * @example
   * const avatarFileName = contact.name() + `.jpg`
   * const avatarReadStream = await contact.avatar()
   * const avatarWriteStream = createWriteStream(avatarFileName)
   * avatarReadStream.pipe(avatarWriteStream)
   * log.info('Bot', 'Contact: %s: %s with avatar file: %s', contact.weixin(), contact.name(), avatarFileName)
   */
  public async avatar(): Promise<NodeJS.ReadableStream> {
    log.verbose('PuppeteerContact', 'avatar()')

    if (!this.obj) {
      throw new Error('Can not get avatar: no this.obj!')
    } else if (!this.obj.avatar) {
      throw new Error('Can not get avatar: no this.obj.avatar!')
    }

    try {
      const hostname = await (this.puppet as any as PuppetPuppeteer).hostname()
      const avatarUrl = `http://${hostname}${this.obj.avatar}&type=big` // add '&type=big' to get big image
      const cookies = await (this.puppet as any as PuppetPuppeteer).cookies()
      log.silly('PuppeteerContact', 'avatar() url: %s', avatarUrl)

      return Misc.urlStream(avatarUrl, cookies)
    } catch (err) {
      log.warn('PuppeteerContact', 'avatar() exception: %s', err.stack)
      Raven.captureException(err)
      throw err
    }
  }

  /**
   * @private
   */
  public get(prop)  { return this.obj && this.obj[prop] }

  /**
   * @private
   */
  public isReady(): boolean {
    return !!(this.obj && this.obj.id && this.obj.name)
  }

  /**
   * Force reload data for Contact
   *
   * @returns {Promise<this>}
   * @example
   * await contact.refresh()
   */
  public async refresh(): Promise<this> {
    // TODO: make sure the contact.* works when we are refreshing the data
    // if (this.isReady()) {
    //   this.dirtyObj = this.obj
    // }
    this.obj = undefined
    await this.ready()
    return this
  }

  /**
   * @private
   */
  public async ready(): Promise<this> {
    // log.silly('PuppeteerContact', 'ready(' + (contactGetter ? typeof contactGetter : '') + ')')
    if (!this.id) {
      const e = new Error('ready() call on an un-inited contact')
      throw e
    }

    if (this.isReady()) { // already ready
      return Promise.resolve(this)
    }

    try {
      const rawObj = await (this.puppet as any as PuppetPuppeteer).getContact(this.id) as PuppeteerContactRawObj
      log.silly('PuppeteerContact', `contactGetter(${this.id}) resolved`)

      this.rawObj = rawObj
      this.obj    = this.parse(rawObj)

      return this

    } catch (e) {
      log.error('PuppeteerContact', `contactGetter(${this.id}) exception: %s`, e.message)
      Raven.captureException(e)
      throw e
    }
  }

  /**
   * @private
   */
  public dumpRaw() {
    console.error('======= dump raw contact =======')
    Object.keys(this.rawObj).forEach(k => console.error(`${k}: ${this.rawObj[k]}`))
  }

  /**
   * @private
   */
  public dump()    {
    console.error('======= dump contact =======')
    if (!this.obj) {
      throw new Error('no this.obj')
    }
    Object.keys(this.obj).forEach(k => console.error(`${k}: ${this.obj && this.obj[k]}`))
  }

  /**
   * Check if contact is self
   *
   * @returns {boolean} True for contact is self, False for contact is others
   * @example
   * const isSelf = contact.self()
   */
  public self(): boolean {
    const user = this.puppet.userSelf()

    if (!user) {
      return false
    }

    const userId = user.id

    return this.id === userId
  }

  /**
   * Get the weixin number from a contact.
   *
   * Sometimes cannot get weixin number due to weixin security mechanism, not recommend.
   *
   * @private
   * @returns {string | null}
   * @example
   * const weixin = contact.weixin()
   */
  public weixin(): string | null {
    const wxId = this.obj && this.obj.weixin || null
    if (!wxId) {
      log.verbose('PuppeteerContact', `weixin() is not able to always work, it's limited by Tencent API`)
      log.verbose('PuppeteerContact', 'weixin() If you want to track a contact between sessions, see FAQ at')
      log.verbose('PuppeteerContact', 'https://github.com/Chatie/wechaty/wiki/FAQ#1-how-to-get-the-permanent-id-for-a-contact')
    }
    return wxId
  }

}

export default PuppeteerContact
